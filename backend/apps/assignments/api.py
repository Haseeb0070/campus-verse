from datetime import datetime
from decimal import Decimal
from typing import Literal

from django.core.exceptions import PermissionDenied, ValidationError
from django.http import FileResponse
from django.utils import timezone
from ninja import File, Form, Router, Schema, Status
from ninja.errors import HttpError
from ninja.files import UploadedFile

from apps.academic.models import Section
from apps.chat.serializers import initials
from apps.core.files import ACCEPT
from apps.core.models import StoredFile
from apps.identity.models import User

from . import services
from .models import Assignment, Grade, Submission

router = Router(tags=["assignments"])


class FileOut(Schema):
    id: int
    name: str
    size: int
    content_type: str


class SubmissionOut(Schema):
    id: int
    attempt: int
    text: str
    files: list[FileOut]
    submitted_at: datetime
    is_late: bool


class GradeOut(Schema):
    points: Decimal
    feedback: str


class AssignmentOut(Schema):
    id: int
    title: str
    instructions: str
    status: str
    section_id: int
    section_code: str
    course_code: str
    course_title: str
    color: str
    available_from: datetime
    due_at: datetime
    submission_type: str
    max_points: int
    allow_late: bool
    late_until: datetime | None
    max_attempts: int
    grades_released: bool
    window: str
    can_manage: bool
    attachments: list[FileOut]
    # Student view
    my_attempts: int | None = None
    my_submissions: list[SubmissionOut] | None = None
    my_grade: GradeOut | None = None
    # Teacher view
    submitted_count: int | None = None
    graded_count: int | None = None
    student_count: int | None = None


class AssignmentIn(Schema):
    section_id: int
    title: str
    instructions: str = ""
    available_from: datetime | None = None
    due_at: datetime
    submission_type: Literal["text", "file", "both"] = "file"
    max_points: int = 10
    allow_late: bool = False
    late_until: datetime | None = None
    max_attempts: int = 1
    publish: bool = True


class StudentOut(Schema):
    id: int
    name: str
    email: str
    initials: str


class RosterRowOut(Schema):
    student: StudentOut
    attempts: int
    latest: SubmissionOut | None
    grade: GradeOut | None


class GradeIn(Schema):
    points: Decimal
    feedback: str = ""


class ErrorOut(Schema):
    detail: str


class UploadRulesOut(Schema):
    accept: str
    max_mb: int


def _file_out(f: StoredFile) -> dict:
    return {"id": f.pk, "name": f.original_name, "size": f.size, "content_type": f.content_type}


def _submission_out(s: Submission) -> dict:
    return {
        "id": s.pk,
        "attempt": s.attempt,
        "text": s.text,
        "files": [_file_out(f) for f in s.files.all()],
        "submitted_at": s.submitted_at,
        "is_late": s.is_late,
    }


def _assignment_out(a: Assignment, user, *, detail: bool) -> dict:
    course = a.section.offering.course
    manage = services.can_manage(user, a)
    out = {
        "id": a.pk,
        "title": a.title,
        "instructions": a.instructions if detail else "",
        "status": a.status,
        "section_id": a.section_id,
        "section_code": a.section.code,
        "course_code": course.code,
        "course_title": course.title,
        "color": course.color,
        "available_from": a.available_from,
        "due_at": a.due_at,
        "submission_type": a.submission_type,
        "max_points": a.max_points,
        "allow_late": a.allow_late,
        "late_until": a.late_until,
        "max_attempts": a.max_attempts,
        "grades_released": a.grades_released_at is not None,
        "window": services.submission_window(a, timezone.now()),
        "can_manage": manage,
        "attachments": [_file_out(f) for f in a.attachments.all()] if detail else [],
    }
    if manage:
        rows = services.roster(a)
        out |= {
            "student_count": len(rows),
            "submitted_count": sum(1 for r in rows if r.latest),
            "graded_count": sum(1 for r in rows if r.grade),
        }
    elif services.is_student_in(user, a.section_id):
        subs = list(
            Submission.objects.filter(assignment=a, student=user)
            .prefetch_related("files")
            .order_by("attempt")
        )
        grade = Grade.objects.filter(assignment=a, student=user).first()
        out |= {
            "my_attempts": len(subs),
            "my_submissions": [_submission_out(s) for s in subs] if detail else [],
            # Hidden until the teacher releases grades (SRS FR-ASG-07).
            "my_grade": (
                {"points": grade.points, "feedback": grade.feedback}
                if grade and a.grades_released_at
                else None
            ),
        }
    return out


def _get(request, assignment_id: int) -> Assignment:
    try:
        return services.get_assignment_for(request.user, assignment_id)
    except Assignment.DoesNotExist:
        raise HttpError(404, "Assignment not found") from None


def _errors(fn):
    try:
        return fn()
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


@router.get("", response=list[AssignmentOut])
def list_assignments(request):
    assignments = services.visible_assignments(request.user).order_by("due_at")
    return [_assignment_out(a, request.user, detail=False) for a in assignments]


@router.get("/upload-rules", response=UploadRulesOut)
def upload_rules(request):
    from django.conf import settings

    return {"accept": ACCEPT, "max_mb": settings.CAMPUSVERSE_MAX_UPLOAD_MB}


@router.post("", response={201: AssignmentOut, 403: ErrorOut, 422: ErrorOut})
def create(request, payload: AssignmentIn):
    section = Section.objects.filter(
        pk=payload.section_id, institution_id=request.user.institution_id
    ).first()
    if section is None:
        raise HttpError(404, "Section not found")
    fields = payload.dict(exclude={"section_id", "publish"})
    fields["available_from"] = fields["available_from"] or timezone.now()
    fields["status"] = (
        Assignment.Status.PUBLISHED if payload.publish else Assignment.Status.DRAFT
    )

    def go():
        a = services.create_assignment(request.user, section=section, **fields)
        return Status(201, _assignment_out(a, request.user, detail=True))

    return _errors(go)


@router.get("/{assignment_id}", response=AssignmentOut)
def detail(request, assignment_id: int):
    return _assignment_out(_get(request, assignment_id), request.user, detail=True)


@router.post("/{assignment_id}/attachments", response={201: FileOut, 403: ErrorOut, 422: ErrorOut})
def attach(request, assignment_id: int, file: File[UploadedFile]):
    a = _get(request, assignment_id)
    return _errors(lambda: Status(201, _file_out(services.add_attachment(request.user, a, file))))


@router.post(
    "/{assignment_id}/submissions", response={201: SubmissionOut, 403: ErrorOut, 422: ErrorOut}
)
def submit(
    request,
    assignment_id: int,
    text: Form[str] = "",
    files: File[list[UploadedFile]] = None,
):
    a = _get(request, assignment_id)
    return _errors(
        lambda: Status(
            201, _submission_out(services.submit(request.user, a, text=text, uploads=files or []))
        )
    )


@router.get("/{assignment_id}/submissions", response={200: list[RosterRowOut], 403: ErrorOut})
def submissions(request, assignment_id: int):
    a = _get(request, assignment_id)
    if not services.can_manage(request.user, a):
        return Status(403, {"detail": "Only the section's teachers can see submissions."})
    return Status(
        200,
        [
            {
                "student": {
                    "id": r.student.pk,
                    "name": r.student.get_full_name() or r.student.email,
                    "email": r.student.email,
                    "initials": initials(r.student),
                },
                "attempts": r.attempts,
                "latest": _submission_out(r.latest) if r.latest else None,
                "grade": (
                    {"points": r.grade.points, "feedback": r.grade.feedback} if r.grade else None
                ),
            }
            for r in services.roster(a)
        ],
    )


@router.put(
    "/{assignment_id}/grades/{student_id}", response={200: GradeOut, 403: ErrorOut, 422: ErrorOut}
)
def grade(request, assignment_id: int, student_id: int, payload: GradeIn):
    a = _get(request, assignment_id)
    student = User.objects.filter(pk=student_id, institution_id=request.user.institution_id).first()
    if student is None:
        raise HttpError(404, "Student not found")

    def go():
        g = services.record_grade(
            request.user, a, student, points=payload.points, feedback=payload.feedback
        )
        return Status(200, {"points": g.points, "feedback": g.feedback})

    return _errors(go)


@router.post("/{assignment_id}/release", response={204: None, 403: ErrorOut})
def release(request, assignment_id: int):
    a = _get(request, assignment_id)
    return _errors(lambda: (services.release_grades(request.user, a), Status(204, None))[1])


@router.get("/files/{file_id}", response={200: None})
def download(request, file_id: int):
    stored = StoredFile.objects.filter(pk=file_id).first()
    # Same 404 whether it doesn't exist or isn't yours: no probing for file IDs (SRS 9.2).
    if stored is None or not services.can_download(request.user, stored):
        raise HttpError(404, "File not found")
    response = FileResponse(
        stored.file.open("rb"),
        as_attachment=True,
        filename=stored.original_name,
        content_type=stored.content_type,
    )
    response["Cache-Control"] = "private, no-store"
    return response
