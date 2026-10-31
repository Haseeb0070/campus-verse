from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.audience import can_target
from apps.core.files import check_upload, store_upload
from apps.core.models import AudienceScope, StoredFile
from apps.enrollment.models import SectionEnrollment
from apps.governance import audit
from apps.scheduling.services import member_section_ids

from .models import Assignment, Grade, Submission

MAX_TEXT = 20_000


def can_manage(user, assignment: Assignment) -> bool:
    return can_target(user, AudienceScope.SECTION, assignment.section_id)


def is_student_in(user, section_id: int) -> bool:
    return SectionEnrollment.objects.filter(
        student=user, section_id=section_id, status=SectionEnrollment.Status.ACTIVE
    ).exists()


def visible_assignments(user):
    """Students: published work that's open in their sections. Teachers and admins: everything
    in sections they manage, drafts included."""
    if user.institution_id is None:
        return Assignment.objects.none()
    sections = member_section_ids(user)
    managed = {s for s in sections if can_target(user, AudienceScope.SECTION, s)}
    now = timezone.now()
    return (
        Assignment.objects.filter(institution_id=user.institution_id)
        .filter(
            Q(section_id__in=managed)
            | Q(
                section_id__in=sections - managed,
                status=Assignment.Status.PUBLISHED,
                available_from__lte=now,
            )
        )
        .select_related("section__offering__course")
    )


def get_assignment_for(user, assignment_id: int) -> Assignment:
    assignment = visible_assignments(user).filter(pk=assignment_id).first()
    if assignment is None:
        raise Assignment.DoesNotExist
    return assignment


def _validate_settings(a: Assignment) -> None:
    a.title = (a.title or "").strip()
    if not a.title:
        raise ValidationError("Give the assignment a title.")
    if len(a.title) > 200:
        raise ValidationError("Titles can be up to 200 characters.")
    if a.due_at <= a.available_from:
        raise ValidationError("The due date has to be after it opens.")
    if a.max_points < 1:
        raise ValidationError("Points have to be at least 1.")
    if not 1 <= a.max_attempts <= 10:
        raise ValidationError("Attempts must be between 1 and 10.")
    if a.allow_late and a.late_until is not None and a.late_until <= a.due_at:
        raise ValidationError("The late deadline has to be after the due date.")
    if not a.allow_late:
        a.late_until = None


@transaction.atomic
def create_assignment(user, *, section, **fields) -> Assignment:
    if not can_target(user, AudienceScope.SECTION, section.pk):
        raise PermissionDenied("You can only set work for sections you teach.")
    assignment = Assignment(
        institution_id=section.institution_id, section=section, created_by=user, **fields
    )
    _validate_settings(assignment)
    assignment.save()
    audit.record(actor=user, action="assignment.created", target=assignment)
    return assignment


def add_attachment(user, assignment: Assignment, upload) -> StoredFile:
    if not can_manage(user, assignment):
        raise PermissionDenied("Only the section's teachers can add files.")
    stored = store_upload(user, upload)
    assignment.attachments.add(stored)
    return stored


def submission_window(assignment: Assignment, now: datetime) -> str:
    """'open', 'late' (accepted but marked late), 'closed' or 'not_open'."""
    if now < assignment.available_from:
        return "not_open"
    if now <= assignment.due_at:
        return "open"
    if assignment.allow_late and (assignment.late_until is None or now <= assignment.late_until):
        return "late"
    return "closed"


def attempts_used(assignment: Assignment, student) -> int:
    return Submission.objects.filter(assignment=assignment, student=student).count()


@transaction.atomic
def submit(user, assignment: Assignment, *, text: str = "", uploads=()) -> Submission:
    if assignment.status != Assignment.Status.PUBLISHED:
        raise ValidationError("This assignment isn't open yet.")
    if not is_student_in(user, assignment.section_id):
        raise PermissionDenied("Only students in this section can submit.")
    window = submission_window(assignment, timezone.now())
    if window == "not_open":
        raise ValidationError("This assignment isn't open yet.")
    if window == "closed":
        raise ValidationError("The deadline has passed and late work isn't accepted.")
    used = attempts_used(assignment, user)
    if used >= assignment.max_attempts:
        raise ValidationError("You've used all your attempts for this assignment.")

    text = (text or "").strip()
    uploads = list(uploads)
    kind = assignment.SubmissionType
    if len(text) > MAX_TEXT:
        raise ValidationError(f"Text answers can be up to {MAX_TEXT} characters.")
    if assignment.submission_type == kind.TEXT and (not text or uploads):
        raise ValidationError("This assignment takes a written answer, without files.")
    if assignment.submission_type == kind.FILE and (not uploads or text):
        raise ValidationError("This assignment takes files only. Attach at least one.")
    if not text and not uploads:
        raise ValidationError("Add a written answer or a file.")

    for upload in uploads:  # reject the whole submission before writing any file to disk
        check_upload(upload)
    stored = [store_upload(user, u) for u in uploads]
    try:
        submission = Submission.objects.create(
            institution_id=assignment.institution_id,
            assignment=assignment,
            student=user,
            attempt=used + 1,
            text=text,
            is_late=window == "late",
        )
    except IntegrityError:
        raise ValidationError(
            "That attempt was already submitted. Refresh and try again."
        ) from None
    submission.files.set(stored)
    return submission


@transaction.atomic
def record_grade(user, assignment: Assignment, student, *, points: Decimal, feedback: str = ""):
    if not can_manage(user, assignment):
        raise PermissionDenied("Only the section's teachers can grade.")
    if not is_student_in(student, assignment.section_id):
        raise ValidationError("That student isn't in this section.")
    if points < 0 or points > assignment.max_points:
        raise ValidationError(f"Points must be between 0 and {assignment.max_points}.")
    grade = Grade.objects.filter(assignment=assignment, student=student).first()
    before = None if grade is None else str(grade.points)
    if grade is None:
        grade = Grade(
            institution_id=assignment.institution_id, assignment=assignment, student=student
        )
    grade.points = points
    grade.feedback = (feedback or "").strip()
    grade.graded_by = user
    grade.save()
    audit.record(
        actor=user,
        action="grade.recorded",
        target=grade,
        changes={"student": student.pk, "points": [before, str(points)]},
    )
    return grade


def release_grades(user, assignment: Assignment) -> Assignment:
    if not can_manage(user, assignment):
        raise PermissionDenied("Only the section's teachers can release grades.")
    if assignment.grades_released_at is None:
        assignment.grades_released_at = timezone.now()
        assignment.save(update_fields=["grades_released_at", "updated_at"])
        audit.record(actor=user, action="grades.released", target=assignment)
    return assignment


def can_download(user, stored: StoredFile) -> bool:
    """A file is readable if it's an attachment on an assignment you can see, or part of a
    submission that's yours or that you grade."""
    if stored.institution_id != user.institution_id:
        return False
    if visible_assignments(user).filter(attachments=stored).exists():
        return True
    submission = (
        Submission.objects.filter(files=stored).select_related("assignment").first()
    )
    if submission is None:
        return False
    return submission.student_id == user.pk or can_manage(user, submission.assignment)


@dataclass
class RosterRow:
    student: object
    latest: Submission | None
    attempts: int
    grade: Grade | None


def roster(assignment: Assignment) -> list[RosterRow]:
    enrollments = (
        SectionEnrollment.objects.filter(
            section_id=assignment.section_id, status=SectionEnrollment.Status.ACTIVE
        )
        .select_related("student")
        .order_by("student__first_name", "student__last_name")
    )
    subs: dict[int, list[Submission]] = {}
    for s in (
        Submission.objects.filter(assignment=assignment)
        .prefetch_related("files")
        .order_by("attempt")
    ):
        subs.setdefault(s.student_id, []).append(s)
    grades = {g.student_id: g for g in Grade.objects.filter(assignment=assignment)}
    return [
        RosterRow(
            student=e.student,
            latest=(subs.get(e.student_id) or [None])[-1],
            attempts=len(subs.get(e.student_id, [])),
            grade=grades.get(e.student_id),
        )
        for e in enrollments
    ]
