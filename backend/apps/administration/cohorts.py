"""Sections (academic.Cohort): a group of students who study together, such as
"BS Computer Science · 2024–2028 · Morning · A".

- Admins manage every section; department coordinators manage those of their departments'
  programs.
- A student joining a section is enrolled in all its open subjects (this term's and any already
  set up for later terms); leaving drops them from those subjects, and from being its CR/GR.
- A subject added for a section (structure.create_section) takes its code and enrolls its
  students, so the section's whole class list is in every subject without enrolling one by one.
  An admin can still drop one student from one subject, or add someone from outside (repeaters,
  electives) on the subject's page.
"""

import re

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.academic.models import Cohort, CohortMember, Program, Section
from apps.enrollment.models import SectionEnrollment
from apps.governance import audit

from .structure import _person, _same_institution, _save, department_ids_for

#: Short codes, as on a timetable: "CS24-MA", "G1+G2".
CODE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._+/-]{0,15}$")


def can_manage(user, cohort: Cohort) -> bool:
    if cohort.institution_id != user.institution_id:
        return False
    allowed = department_ids_for(user)
    if allowed is None:
        return True
    return bool(cohort.program_id) and cohort.program.department_id in allowed


def require_manage(user, cohort: Cohort) -> None:
    if not can_manage(user, cohort):
        raise PermissionDenied("You can only manage sections of your own departments.")


def visible(user):
    """The sections this person manages."""
    qs = Cohort.objects.filter(institution_id=user.institution_id).select_related(
        "program__department")
    allowed = department_ids_for(user)
    if allowed is not None:
        qs = qs.filter(program__department_id__in=allowed)
    return qs


def _code(value: str) -> str:
    value = " ".join((value or "").split()).upper()
    if not CODE.match(value):
        raise ValidationError("A section code is up to 16 letters, numbers or - . + / "
                              '(for example "CS24-MA").')
    return value


def _year(value) -> int | None:
    if value in (None, ""):
        return None
    year = int(value)
    if not 1950 <= year <= 2100:
        raise ValidationError("Give the batch years as four digits, like 2024.")
    return year


@transaction.atomic
def save_cohort(user, cohort: Cohort | None, *, program_id, code, name="", shift="",
                start_year=None, end_year=None, status=None) -> Cohort:
    program = None
    if program_id:
        program = Program.objects.filter(pk=program_id).first()
        _same_institution(user, program)
    allowed = department_ids_for(user)
    if allowed is not None and (program is None or program.department_id not in allowed):
        raise PermissionDenied("Choose a program in one of your departments.")
    if cohort is not None:
        require_manage(user, cohort)
    if shift not in ("", *Cohort.Shift.values):
        raise ValidationError("The shift is morning or evening.")
    name = " ".join((name or "").split())
    if len(name) > 40:
        raise ValidationError("Keep the name short, like A or Blue.")
    start, end = _year(start_year), _year(end_year)
    if start and end and end <= start:
        raise ValidationError("The batch has to end after it starts.")
    if status is not None and status not in Cohort.Status.values:
        raise ValidationError("A section is active or archived.")

    new = cohort is None
    cohort = cohort or Cohort(institution_id=user.institution_id)
    before_code = cohort.code
    fields = {"program": program, "code": _code(code), "name": name, "shift": shift,
              "start_year": start, "end_year": end}
    if status is not None:
        fields["status"] = status
    changes = {}
    for key, value in fields.items():
        if new or getattr(cohort, key) != value:
            changes[key] = str(value)
            setattr(cohort, key, value)
    if not changes and not new:
        return cohort
    _save(cohort, actor=user, action="cohort.created" if new else "cohort.updated",
          changes=changes, duplicate="Another section already uses that code.")
    if not new and before_code != cohort.code:
        # Subjects show their section's code everywhere (timetable, chat, notices).
        cohort.subjects.update(code=cohort.code)
    return cohort


def open_subjects(cohort: Cohort):
    """The section's subjects students should be in now: active, in the current term or one
    that hasn't ended yet."""
    today = timezone.localdate()
    return Section.objects.filter(
        Q(offering__term__ends_on__gte=today) | Q(offering__term__is_current=True),
        cohort=cohort, status=Section.Status.ACTIVE,
    )


class InOtherSection(Exception):
    """Some of the students are already in another active section; the caller didn't say to
    move them. A student is in one section at a time."""

    def __init__(self, where: list[tuple[str, str]]):
        self.where = where  # (student, section code)
        names = "; ".join(f"{who} is in {code}" for who, code in where[:3])
        more = f" and {len(where) - 3} more" if len(where) > 3 else ""
        super().__init__(f"{names}{more}.")


def other_sections(student_ids, cohort: Cohort) -> dict[int, CohortMember]:
    """Student id -> their active place in a different section."""
    return {m.student_id: m for m in CohortMember.objects.filter(
        student_id__in=student_ids, status=CohortMember.Status.ACTIVE,
        cohort__status=Cohort.Status.ACTIVE,
    ).exclude(cohort=cohort).select_related("cohort", "student")}


@transaction.atomic
def add_students(user, cohort: Cohort, person_ids: list[int], *, move: bool = False) -> int:
    """Puts students in the section and in all its open subjects. Returns how many joined.

    A student already in another active section raises InOtherSection, unless `move`, which
    takes them out of it first (dropped from its subjects and its CR/GR, as remove_student)."""
    require_manage(user, cohort)
    if cohort.status != Cohort.Status.ACTIVE:
        raise ValidationError("This section is archived. Restore it before adding students.")
    students = [_person(user, pid, "student") for pid in dict.fromkeys(person_ids)]
    elsewhere = other_sections([s.pk for s in students], cohort)
    if elsewhere and not move:
        raise InOtherSection([(m.student.get_full_name() or m.student.email, m.cohort.code)
                              for m in elsewhere.values()])
    for m in elsewhere.values():
        remove_student(user, m.cohort, m.student_id)
    subjects = list(open_subjects(cohort))
    joined = 0
    for student in students:
        member, created = CohortMember.objects.get_or_create(
            cohort=cohort, student=student, defaults={"institution_id": cohort.institution_id})
        if not created and member.status != CohortMember.Status.ACTIVE:
            member.status = CohortMember.Status.ACTIVE
            member.save()
            created = True
        joined += created
        for subject in subjects:
            enrollment, new = SectionEnrollment.objects.get_or_create(
                section=subject, student=student,
                defaults={"institution_id": subject.institution_id})
            if not new and enrollment.status != SectionEnrollment.Status.ACTIVE:
                enrollment.status = SectionEnrollment.Status.ACTIVE
                enrollment.save()  # the signal refreshes their access
    if joined:
        audit.record(actor=user, action="cohort.students_added", target=cohort,
                     changes={"students": [s.pk for s in students], "joined": joined,
                              "moved_from": sorted({m.cohort.code for m in elsewhere.values()})})
    return joined


@transaction.atomic
def remove_student(user, cohort: Cohort, person_id: int) -> None:
    """Takes a student out of the section: dropped from its open subjects, no longer its CR/GR.
    Past terms' records stay as they were."""
    from apps.classreps.models import ClassRep

    require_manage(user, cohort)
    member = CohortMember.objects.filter(cohort=cohort, student_id=person_id).first()
    if member is None or member.status == CohortMember.Status.LEFT:
        raise ValidationError("That student isn't in this section.")
    member.status = CohortMember.Status.LEFT
    member.save()
    for enrollment in SectionEnrollment.objects.filter(
        section__in=open_subjects(cohort), student_id=person_id,
        status=SectionEnrollment.Status.ACTIVE,
    ):
        enrollment.status = SectionEnrollment.Status.DROPPED
        enrollment.save()
    ClassRep.objects.filter(
        Q(term__ends_on__gte=timezone.localdate()) | Q(term__is_current=True),
        cohort=cohort, student_id=person_id,
    ).delete()
    audit.record(actor=user, action="cohort.student_removed", target=cohort,
                 changes={"student": person_id})


def enroll_members(subject: Section) -> int:
    """A new subject for a section starts with the section's students."""
    if not subject.cohort_id:
        return 0
    have = set(SectionEnrollment.objects.filter(section=subject)
               .values_list("student_id", flat=True))
    new = [
        SectionEnrollment(institution_id=subject.institution_id, section=subject, student_id=sid)
        for sid in CohortMember.objects.filter(cohort_id=subject.cohort_id,
                                               status=CohortMember.Status.ACTIVE)
        .values_list("student_id", flat=True)
        if sid not in have
    ]
    # bulk_create skips the post_save signal, so refresh each student's access here.
    SectionEnrollment.objects.bulk_create(new)
    if new:
        from apps.core.audience import invalidate_context

        for e in new:
            invalidate_context(e.student_id)
    return len(new)
