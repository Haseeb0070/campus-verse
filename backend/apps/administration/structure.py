"""Academic structure management (SRS 5.2, 5.13): terms, departments, programs, courses,
sections, teacher assignments and enrollments. Admins manage everything in their institution;
department coordinators manage courses and sections in their departments. Records are archived
or marked dropped rather than deleted, so history survives (FR-ACAD-06/07). Every change is
audit-logged."""

import re

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction

from apps.academic.models import (
    AcademicTerm,
    Course,
    CourseOffering,
    Department,
    Program,
    Section,
)
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.governance import audit
from apps.identity.models import User
from apps.identity.roles import coordinated_department_ids, is_institution_admin

CODE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$")


# Permissions ---------------------------------------------------------------------------------


def department_ids_for(user) -> set[int] | None:
    """None means every department (an institution admin)."""
    if is_institution_admin(user):
        return None
    return coordinated_department_ids(user)


def can_manage_structure(user) -> bool:
    return is_institution_admin(user) or bool(coordinated_department_ids(user))


def require_admin(user) -> None:
    if not is_institution_admin(user):
        raise PermissionDenied("Only institution admins can do this.")


def require_department(user, department_id: int) -> None:
    allowed = department_ids_for(user)
    if allowed is not None and department_id not in allowed:
        raise PermissionDenied("You can only manage your own departments.")


def _same_institution(user, obj) -> None:
    if obj is None or obj.institution_id != user.institution_id:
        raise PermissionDenied("That isn't in your institution.")


# Validation helpers ---------------------------------------------------------------------------


def _code(value: str, what: str) -> str:
    value = " ".join((value or "").split())
    if not CODE.match(value):
        raise ValidationError(f"{what} codes use letters, numbers, dashes or dots (up to 32).")
    return value.upper()


def _name(value: str, what: str) -> str:
    value = " ".join((value or "").split())
    if not value:
        raise ValidationError(f"Give the {what} a name.")
    if len(value) > 200:
        raise ValidationError("Names can be up to 200 characters.")
    return value


def _save(obj, *, actor, action: str, duplicate: str, changes: dict | None = None):
    try:
        with transaction.atomic():
            obj.save()
    except IntegrityError:
        raise ValidationError(duplicate) from None
    audit.record(actor=actor, action=action, target=obj, changes=changes or {})
    return obj


def _apply(obj, fields: dict) -> dict:
    changes = {}
    for name, value in fields.items():
        if value is not None and getattr(obj, name) != value:
            changes[name] = [str(getattr(obj, name)), str(value)]
            setattr(obj, name, value)
    return changes


# Terms (admins) ------------------------------------------------------------------------------


def save_term(user, term: AcademicTerm | None, *, name, code, starts_on, ends_on) -> AcademicTerm:
    require_admin(user)
    if term is not None:
        _same_institution(user, term)
    if ends_on <= starts_on:
        raise ValidationError("A term has to end after it starts.")
    term = term or AcademicTerm(institution_id=user.institution_id)
    changes = _apply(term, {"name": _name(name, "term"), "code": _code(code, "Term"),
                            "starts_on": starts_on, "ends_on": ends_on})
    return _save(term, actor=user, action="term.saved", changes=changes,
                 duplicate="Another term already uses that code.")


@transaction.atomic
def make_current(user, term: AcademicTerm) -> AcademicTerm:
    require_admin(user)
    _same_institution(user, term)
    AcademicTerm.objects.filter(institution_id=user.institution_id).exclude(pk=term.pk) \
        .update(is_current=False)
    term.is_current = True
    term.save(update_fields=["is_current", "updated_at"])
    audit.record(actor=user, action="term.made_current", target=term)
    return term


# Departments and programs -------------------------------------------------------------------


def save_department(user, dept: Department | None, *, name, code) -> Department:
    require_admin(user)
    if dept is not None:
        _same_institution(user, dept)
    dept = dept or Department(institution_id=user.institution_id)
    changes = _apply(dept, {"name": _name(name, "department"), "code": _code(code, "Department")})
    return _save(dept, actor=user, action="department.saved", changes=changes,
                 duplicate="Another department already uses that code.")


def save_program(user, program: Program | None, *, department_id, name, code) -> Program:
    dept = Department.objects.filter(pk=department_id).first()
    _same_institution(user, dept)
    require_department(user, dept.pk)
    if program is not None:
        _same_institution(user, program)
        require_department(user, program.department_id)
    program = program or Program(institution_id=user.institution_id)
    changes = _apply(program, {"department_id": dept.pk, "name": _name(name, "program"),
                               "code": _code(code, "Program")})
    return _save(program, actor=user, action="program.saved", changes=changes,
                 duplicate="Another program already uses that code.")


# Courses ------------------------------------------------------------------------------------


def save_course(user, course: Course | None, *, department_id, code, title, color,
                credit_hours, is_active=None) -> Course:
    dept = Department.objects.filter(pk=department_id).first()
    _same_institution(user, dept)
    require_department(user, dept.pk)
    if course is not None:
        _same_institution(user, course)
        require_department(user, course.department_id)
    if color not in Course.Color.values:
        raise ValidationError("Pick one of the course colours.")
    if not 0 <= credit_hours <= 12:
        raise ValidationError("Credit hours are between 0 and 12.")
    course = course or Course(institution_id=user.institution_id)
    changes = _apply(course, {
        "department_id": dept.pk, "code": _code(code, "Course"), "title": _name(title, "course"),
        "color": color, "credit_hours": credit_hours, "is_active": is_active,
    })
    return _save(course, actor=user, action="course.saved", changes=changes,
                 duplicate="Another course already uses that code.")


# Sections -----------------------------------------------------------------------------------


def create_section(user, *, course_id, term_id, code=None, program_id=None,
                   cohort_id=None) -> Section:
    """A subject: a course taught to a section (cohort) in a term. Given a section, the subject
    takes its code and program and starts with all its students."""
    from apps.academic.models import Cohort

    from .cohorts import enroll_members, require_manage

    course = Course.objects.filter(pk=course_id).first()
    term = AcademicTerm.objects.filter(pk=term_id).first()
    _same_institution(user, course)
    _same_institution(user, term)
    require_department(user, course.department_id)
    if not course.is_active:
        raise ValidationError("That course is archived. Restore it first.")
    cohort = None
    program = None
    if cohort_id:
        cohort = Cohort.objects.filter(pk=cohort_id).select_related("program").first()
        _same_institution(user, cohort)
        require_manage(user, cohort)
        if cohort.status != Cohort.Status.ACTIVE:
            raise ValidationError("That section is archived. Restore it first.")
        code, program = cohort.code, cohort.program
    elif not code:
        raise ValidationError("Choose the section this subject is for.")
    elif program_id:
        program = Program.objects.filter(pk=program_id).first()
        _same_institution(user, program)
    with transaction.atomic():
        offering, _ = CourseOffering.objects.get_or_create(
            course=course, term=term, defaults={"institution_id": user.institution_id}
        )
        section = Section(institution_id=user.institution_id, offering=offering, cohort=cohort,
                          code=cohort.code if cohort else _code(code, "Section"), program=program)
        _save(section, actor=user, action="section.created",
              changes={"course": course.code, "term": term.code, "section": section.code},
              duplicate=f"{section.code} already has {course.code} that term.")
        enroll_members(section)
        return section


def update_section(user, section: Section, *, code=None, program_id=..., status=None) -> Section:
    _same_institution(user, section)
    require_department(user, section.offering.course.department_id)
    fields = {}
    if code is not None and code != section.code:
        if section.cohort_id:
            raise ValidationError("This subject takes its section's code. Change the section.")
        fields["code"] = _code(code, "Section")
    if program_id is not ...:
        if program_id:
            program = Program.objects.filter(pk=program_id).first()
            _same_institution(user, program)
        fields["program_id"] = program_id or None
    if status is not None:
        if status not in Section.Status.values:
            raise ValidationError("A section is active or archived.")
        fields["status"] = status
    changes = {}
    for name, value in fields.items():  # program_id may legitimately be None
        if getattr(section, name) != value:
            changes[name] = [str(getattr(section, name)), str(value)]
            setattr(section, name, value)
    if not changes:
        return section
    _save(section, actor=user, action="section.updated", changes=changes,
          duplicate="That section code is already taken in this course and term.")
    if "status" in changes:  # membership-derived access changes with the section's status
        from apps.core.audience import invalidate_context

        people = set(section.enrollments.values_list("student_id", flat=True)) | set(
            section.teacher_assignments.values_list("teacher_id", flat=True))
        for uid in people:
            invalidate_context(uid)
    return section


# Teachers and students -----------------------------------------------------------------------


def _person(user, person_id: int, kind: str) -> User:
    person = User.objects.filter(pk=person_id, institution_id=user.institution_id).first()
    if person is None:
        raise ValidationError("That person isn't in your institution.")
    if not person.is_active:
        raise ValidationError(f"{person} is deactivated.")
    if kind == "teacher" and person.kind == User.Kind.STUDENT:
        raise ValidationError(f"{person} is a student, not a teacher.")
    if kind == "student" and person.kind != User.Kind.STUDENT:
        raise ValidationError(f"{person} isn't a student.")
    return person


def _section_guard(user, section: Section) -> None:
    _same_institution(user, section)
    require_department(user, section.offering.course.department_id)


def assign_teacher(user, section: Section, person_id: int, role: str = "lead") -> TeacherAssignment:
    _section_guard(user, section)
    teacher = _person(user, person_id, "teacher")
    if role not in TeacherAssignment.Role.values:
        raise ValidationError("A teacher is lead or assistant.")
    assignment, created = TeacherAssignment.objects.get_or_create(
        section=section, teacher=teacher,
        defaults={"institution_id": section.institution_id, "role": role},
    )
    if not created and assignment.role != role:
        assignment.role = role
        assignment.save(update_fields=["role", "updated_at"])
    audit.record(actor=user, action="section.teacher_assigned", target=section,
                 changes={"teacher": teacher.pk, "role": role})
    return assignment


def remove_teacher(user, section: Section, person_id: int) -> None:
    _section_guard(user, section)
    deleted, _ = TeacherAssignment.objects.filter(section=section, teacher_id=person_id).delete()
    if deleted:  # TeacherAssignment keeps its own history table
        audit.record(actor=user, action="section.teacher_removed", target=section,
                     changes={"teacher": person_id})


def enroll(user, section: Section, person_ids: list[int]) -> int:
    _section_guard(user, section)
    if section.status != Section.Status.ACTIVE:
        raise ValidationError("This section is archived. Restore it before enrolling students.")
    students = [_person(user, pid, "student") for pid in dict.fromkeys(person_ids)]
    added = 0
    for student in students:
        enrollment, created = SectionEnrollment.objects.get_or_create(
            section=section, student=student, defaults={"institution_id": section.institution_id},
        )
        if not created and enrollment.status != SectionEnrollment.Status.ACTIVE:
            enrollment.status = SectionEnrollment.Status.ACTIVE
            enrollment.save()
            created = True
        added += created
    if added:
        audit.record(actor=user, action="section.students_enrolled", target=section,
                     changes={"students": [s.pk for s in students], "added": added})
    return added


def set_enrollment(user, section: Section, person_id: int, status: str) -> SectionEnrollment:
    _section_guard(user, section)
    if status not in SectionEnrollment.Status.values:
        raise ValidationError("Enrollment is active, dropped or completed.")
    enrollment = SectionEnrollment.objects.filter(section=section, student_id=person_id).first()
    if enrollment is None:
        raise ValidationError("That student isn't in this section.")
    if enrollment.status != status:
        before = enrollment.status
        enrollment.status = status
        enrollment.save()  # the signal refreshes their access; history keeps the old status
        audit.record(actor=user, action="section.enrollment_changed", target=section,
                     changes={"student": person_id, "status": [before, status]})
    return enrollment
