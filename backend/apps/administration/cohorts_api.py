"""Manage → Academic → Sections: the groups of students (academic.Cohort), their students, their
subjects each term, and their CR and GR. Mounted at /api/manage/sections."""

from django.db.models import Count, Q
from ninja import Router, Schema, Status
from ninja.errors import HttpError

from apps.academic.models import AcademicTerm, Cohort, CohortMember, Section
from apps.classreps import services as reps
from apps.enrollment.models import TeacherAssignment
from apps.identity.models import User

from . import cohorts
from .structure_api import ErrorOut, PersonOut, _call, _guard, _person

router = Router(tags=["manage: sections"])


class CohortRowOut(Schema):
    id: int
    code: str
    label: str
    name: str
    shift: str
    start_year: int | None
    end_year: int | None
    program_id: int | None
    program: str | None
    status: str
    students: int
    subjects: int  # this term's
    cr: str | None
    gr: str | None


class SubjectOut(Schema):
    id: int
    course_code: str
    course_title: str
    color: str
    status: str
    teachers: list[str]
    students: int


class MemberOut(PersonOut):
    status: str
    role: str | None  # "cr" / "gr" this term


class RepOut(Schema):
    student_id: int
    role: str
    name: str
    chosen_by: str


class CohortDetailOut(CohortRowOut):
    term_id: int | None
    term: str | None
    can_manage: bool
    members: list[MemberOut]
    subject_list: list[SubjectOut]
    reps: list[RepOut]


class CohortIn(Schema):
    program_id: int | None = None
    code: str
    name: str = ""
    shift: str = ""
    start_year: int | None = None
    end_year: int | None = None
    status: str | None = None


class StudentsIn(Schema):
    user_ids: list[int]
    #: Take them out of the section they're in now. Without it, that's a 409.
    move: bool = False


class RepIn(Schema):
    term_id: int
    student_id: int
    role: str | None  # "cr", "gr", or null to take it away
    #: Take the role from the section's current CR/GR. Without it, naming a second one is a 409.
    replace: bool = False


def _term(request, term_id: int | None) -> AcademicTerm | None:
    terms = AcademicTerm.objects.filter(institution_id=request.user.institution_id)
    if term_id:
        term = terms.filter(pk=term_id).first()
        if term is None:
            raise HttpError(404, "Term not found")
        return term
    return terms.filter(is_current=True).first() or terms.order_by("-starts_on").first()


def _cohort(request, cohort_id: int) -> Cohort:
    _guard(request)
    cohort = cohorts.visible(request.user).filter(pk=cohort_id).first()
    if cohort is None:
        raise HttpError(404, "Section not found")
    return cohort


def _rep_names(term, cohort_ids) -> dict[tuple[int, str], str]:
    if term is None:
        return {}
    from apps.classreps.models import ClassRep

    return {(r.cohort_id, r.role): reps.name_of(r.student)
            for r in ClassRep.objects.filter(term=term, cohort_id__in=cohort_ids)
            .select_related("student")}


def _row(c: Cohort, students: int, subjects: int, names: dict) -> dict:
    return {
        "id": c.pk, "code": c.code, "label": c.label, "name": c.name, "shift": c.shift,
        "start_year": c.start_year, "end_year": c.end_year, "program_id": c.program_id,
        "program": c.program.name if c.program_id else None, "status": c.status,
        "students": students, "subjects": subjects,
        "cr": names.get((c.pk, "cr")), "gr": names.get((c.pk, "gr")),
    }


def _detail(request, cohort: Cohort, term: AcademicTerm | None) -> dict:
    subjects = list(
        Section.objects.filter(cohort=cohort, offering__term=term)
        .select_related("offering__course")
        .annotate(n=Count("enrollments", filter=Q(enrollments__status="active")))
        .order_by("offering__course__code")
    ) if term else []
    teachers: dict[int, list[str]] = {}
    for t in TeacherAssignment.objects.filter(section__in=subjects).select_related("teacher"):
        teachers.setdefault(t.section_id, []).append(reps.name_of(t.teacher))
    rep_list = reps.reps_for(cohort, term) if term else []
    role_of = {r.student_id: r.role for r in rep_list}
    members = list(CohortMember.objects.filter(cohort=cohort).select_related("student")
                   .order_by("status", "student__first_name", "student__last_name"))
    names = {(cohort.pk, r.role): reps.name_of(r.student) for r in rep_list}
    active = sum(m.status == CohortMember.Status.ACTIVE for m in members)
    return _row(cohort, active, len(subjects), names) | {
        "term_id": term.pk if term else None, "term": term.name if term else None,
        "can_manage": cohorts.can_manage(request.user, cohort),
        "members": [_person(m.student) | {"status": m.status, "role": role_of.get(m.student_id)}
                    for m in members],
        "subject_list": [{
            "id": s.pk, "course_code": s.offering.course.code,
            "course_title": s.offering.course.title, "color": s.offering.course.color,
            "status": s.status, "teachers": teachers.get(s.pk, []), "students": s.n,
        } for s in subjects],
        "reps": [{"student_id": r.student_id, "role": r.role, "name": reps.name_of(r.student),
                  "chosen_by": reps.name_of(r.assigned_by) if r.assigned_by_id else ""}
                 for r in rep_list],
    }


@router.get("", response=list[CohortRowOut])
def cohort_list(request, term_id: int | None = None, status: str = "active"):
    """Every section this person manages, with its students, this term's subjects and CR/GR."""
    _guard(request)
    term = _term(request, term_id)
    qs = cohorts.visible(request.user)
    if status in Cohort.Status.values:
        qs = qs.filter(status=status)
    qs = qs.annotate(
        n_students=Count("members", filter=Q(members__status="active"), distinct=True),
        n_subjects=Count("subjects", filter=Q(subjects__offering__term=term), distinct=True),
    )
    rows = list(qs)
    names = _rep_names(term, [c.pk for c in rows])
    return [_row(c, c.n_students, c.n_subjects, names) for c in rows]


@router.post("", response={201: CohortDetailOut, 403: ErrorOut, 422: ErrorOut})
def add_cohort(request, payload: CohortIn):
    _guard(request)
    return _call(lambda: Status(201, _detail(
        request, cohorts.save_cohort(request.user, None, **payload.dict()),
        _term(request, None))))


@router.get("/{cohort_id}", response=CohortDetailOut)
def cohort_detail(request, cohort_id: int, term_id: int | None = None):
    return _detail(request, _cohort(request, cohort_id), _term(request, term_id))


@router.put("/{cohort_id}", response={200: CohortDetailOut, 403: ErrorOut, 422: ErrorOut})
def edit_cohort(request, cohort_id: int, payload: CohortIn, term_id: int | None = None):
    cohort = _cohort(request, cohort_id)
    return _call(lambda: Status(200, _detail(
        request, cohorts.save_cohort(request.user, cohort, **payload.dict()),
        _term(request, term_id))))


@router.post("/{cohort_id}/students",
             response={200: CohortDetailOut, 403: ErrorOut, 409: ErrorOut, 422: ErrorOut})
def add_students(request, cohort_id: int, payload: StudentsIn, term_id: int | None = None):
    cohort = _cohort(request, cohort_id)
    try:
        return _call(lambda: (cohorts.add_students(request.user, cohort, payload.user_ids,
                                                   move=payload.move),
                              Status(200, _detail(request, cohort, _term(request, term_id))))[1])
    except cohorts.InOtherSection as err:
        return Status(409, {"detail": str(err)})


@router.delete("/{cohort_id}/students/{user_id}",
               response={200: CohortDetailOut, 403: ErrorOut, 422: ErrorOut})
def remove_student(request, cohort_id: int, user_id: int, term_id: int | None = None):
    cohort = _cohort(request, cohort_id)
    return _call(lambda: (cohorts.remove_student(request.user, cohort, user_id),
                          Status(200, _detail(request, cohort, _term(request, term_id))))[1])


@router.put("/{cohort_id}/reps",
            response={200: CohortDetailOut, 403: ErrorOut, 409: ErrorOut, 422: ErrorOut})
def set_rep(request, cohort_id: int, payload: RepIn):
    """Names the section's CR or GR for a term; they act in every subject it has that term."""
    cohort = _cohort(request, cohort_id)
    term = _term(request, payload.term_id)
    student = User.objects.filter(pk=payload.student_id,
                                  institution_id=request.user.institution_id).first()
    if student is None:
        raise HttpError(404, "Student not found")
    try:
        return _call(lambda: (reps.set_rep(request.user, cohort, term, student, payload.role,
                                           replace=payload.replace),
                              Status(200, _detail(request, cohort, term)))[1])
    except reps.RoleTaken as err:
        return Status(409, {"detail": str(err)})

