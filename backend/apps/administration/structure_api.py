from datetime import date

from django.core.exceptions import PermissionDenied, ValidationError
from django.db.models import Count, Q
from ninja import Router, Schema, Status
from ninja.errors import HttpError

from apps.academic.models import AcademicTerm, Course, Department, Program, Section
from apps.chat.serializers import initials
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.identity.roles import is_institution_admin

from . import structure

router = Router(tags=["manage: academic structure"])


class ErrorOut(Schema):
    detail: str


class TermOut(Schema):
    id: int
    name: str
    code: str
    starts_on: date
    ends_on: date
    is_current: bool


class TermIn(Schema):
    name: str
    code: str
    starts_on: date
    ends_on: date


class ProgramOut(Schema):
    id: int
    name: str
    code: str
    department_id: int


class DepartmentOut(Schema):
    id: int
    name: str
    code: str
    courses: int


class DepartmentIn(Schema):
    name: str
    code: str


class ProgramIn(Schema):
    department_id: int
    name: str
    code: str


class CourseOut(Schema):
    id: int
    code: str
    title: str
    color: str
    credit_hours: int
    is_active: bool
    department_id: int
    department: str


class CourseIn(Schema):
    department_id: int
    code: str
    title: str
    color: str = "slate"
    credit_hours: int = 3
    is_active: bool | None = None


class StructureOut(Schema):
    is_admin: bool
    terms: list[TermOut]
    departments: list[DepartmentOut]
    programs: list[ProgramOut]
    courses: list[CourseOut]
    colors: list[str]


class PersonOut(Schema):
    id: int
    name: str
    email: str
    initials: str


class SectionRowOut(Schema):
    id: int
    code: str
    status: str
    course_id: int
    course_code: str
    course_title: str
    color: str
    program: str | None
    program_id: int | None
    term: str
    teachers: list[str]
    students: int


class TeacherOut(PersonOut):
    role: str


class StudentOut(PersonOut):
    status: str


class SectionDetailOut(SectionRowOut):
    teacher_list: list[TeacherOut]
    student_list: list[StudentOut]


class SectionIn(Schema):
    course_id: int
    term_id: int
    code: str
    program_id: int | None = None


class SectionPatch(Schema):
    code: str | None = None
    program_id: int | None = None
    clear_program: bool = False
    status: str | None = None


class TeacherIn(Schema):
    user_id: int
    role: str = "lead"


class EnrollIn(Schema):
    user_ids: list[int]


class EnrollmentPatch(Schema):
    status: str


def _guard(request):
    if not structure.can_manage_structure(request.user):
        raise HttpError(403, "Only admins and department coordinators can manage this.")


def _call(fn):
    try:
        return fn()
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


def _mine(request, model, pk):
    obj = model.objects.filter(pk=pk, institution_id=request.user.institution_id).first()
    if obj is None:
        raise HttpError(404, "Not found")
    return obj


def _course_out(c: Course) -> dict:
    return {"id": c.pk, "code": c.code, "title": c.title, "color": c.color,
            "credit_hours": c.credit_hours, "is_active": c.is_active,
            "department_id": c.department_id, "department": c.department.name}


def _person(u) -> dict:
    return {"id": u.pk, "name": u.get_full_name() or u.email, "email": u.email,
            "initials": initials(u)}


def _sections(request):
    qs = Section.objects.filter(institution_id=request.user.institution_id).select_related(
        "offering__course", "offering__term", "program"
    )
    allowed = structure.department_ids_for(request.user)
    if allowed is not None:
        qs = qs.filter(offering__course__department_id__in=allowed)
    return qs


def _row(s: Section, teachers: list[str], students: int) -> dict:
    course = s.offering.course
    return {
        "id": s.pk, "code": s.code, "status": s.status, "course_id": course.pk,
        "course_code": course.code, "course_title": course.title, "color": course.color,
        "program": s.program.name if s.program else None, "program_id": s.program_id,
        "term": s.offering.term.name, "teachers": teachers, "students": students,
    }


def _detail(section: Section) -> dict:
    teachers = list(TeacherAssignment.objects.filter(section=section).select_related("teacher")
                    .order_by("teacher__first_name"))
    enrollments = list(SectionEnrollment.objects.filter(section=section).select_related("student")
                       .order_by("status", "student__first_name"))
    return _row(section, [str(t.teacher) for t in teachers],
                sum(e.status == "active" for e in enrollments)) | {
        "teacher_list": [_person(t.teacher) | {"role": t.role} for t in teachers],
        "student_list": [_person(e.student) | {"status": e.status} for e in enrollments],
    }


@router.get("", response=StructureOut)
def overview(request):
    _guard(request)
    inst = request.user.institution_id
    allowed = structure.department_ids_for(request.user)
    departments = Department.objects.filter(institution_id=inst).annotate(n=Count("courses"))
    courses = Course.objects.filter(institution_id=inst).select_related("department")
    programs = Program.objects.filter(institution_id=inst)
    if allowed is not None:
        departments = departments.filter(pk__in=allowed)
        courses = courses.filter(department_id__in=allowed)
        programs = programs.filter(department_id__in=allowed)
    return {
        "is_admin": is_institution_admin(request.user),
        "terms": list(AcademicTerm.objects.filter(institution_id=inst).order_by("-starts_on")),
        "departments": [{"id": d.pk, "name": d.name, "code": d.code, "courses": d.n}
                        for d in departments.order_by("name")],
        "programs": list(programs.order_by("name")),
        "courses": [_course_out(c) for c in courses.order_by("code")],
        "colors": list(Course.Color.values),
    }


@router.post("/terms", response={201: TermOut, 403: ErrorOut, 422: ErrorOut})
def add_term(request, payload: TermIn):
    return _call(lambda: Status(201, structure.save_term(request.user, None, **payload.dict())))


@router.put("/terms/{term_id}", response={200: TermOut, 403: ErrorOut, 422: ErrorOut})
def edit_term(request, term_id: int, payload: TermIn):
    term = _mine(request, AcademicTerm, term_id)
    return _call(lambda: Status(200, structure.save_term(request.user, term, **payload.dict())))


@router.post("/terms/{term_id}/current", response={200: TermOut, 403: ErrorOut})
def current(request, term_id: int):
    term = _mine(request, AcademicTerm, term_id)
    return _call(lambda: Status(200, structure.make_current(request.user, term)))


class NextSemesterIn(Schema):
    name: str
    code: str
    starts_on: date
    ends_on: date
    copy_sections: bool = False
    copy_teachers: bool = False
    carry_students: bool = True
    close_old: bool = True
    make_current: bool = True


class NextSemesterOut(Schema):
    term: TermOut
    sections_copied: int
    teachers_copied: int
    students_carried: int
    sections_closed: int


@router.post("/terms/{term_id}/next", response={201: NextSemesterOut, 403: ErrorOut, 422: ErrorOut})
def start_next(request, term_id: int, payload: NextSemesterIn):
    """Starts the semester after this one (see rollover.start_semester)."""
    from .rollover import start_semester

    term = _mine(request, AcademicTerm, term_id)
    p = payload

    def go():
        r = start_semester(
            request.user, term, name=p.name, code=p.code, starts_on=p.starts_on,
            ends_on=p.ends_on, copy_sections=p.copy_sections, copy_teachers=p.copy_teachers,
            carry=p.carry_students, close_old=p.close_old, make_new_current=p.make_current,
        )
        return Status(201, {"term": r.term, "sections_copied": r.sections_copied,
                            "teachers_copied": r.teachers_copied,
                            "students_carried": r.students_carried,
                            "sections_closed": r.sections_closed})

    return _call(go)


class CarryOut(Schema):
    students_carried: int


@router.post("/terms/{term_id}/carry-from/{from_id}",
             response={200: CarryOut, 403: ErrorOut, 422: ErrorOut})
def carry(request, term_id: int, from_id: int):
    """After importing a new semester's subjects: each class joins the sections named alike."""
    from .rollover import carry_students

    to_term = _mine(request, AcademicTerm, term_id)
    from_term = _mine(request, AcademicTerm, from_id)
    return _call(lambda: Status(200, {"students_carried": carry_students(request.user, from_term,
                                                                          to_term)}))


@router.post("/departments", response={201: DepartmentOut, 403: ErrorOut, 422: ErrorOut})
def add_department(request, payload: DepartmentIn):
    def go():
        d = structure.save_department(request.user, None, **payload.dict())
        return Status(201, {"id": d.pk, "name": d.name, "code": d.code, "courses": 0})
    return _call(go)


@router.put("/departments/{dept_id}", response={200: DepartmentOut, 403: ErrorOut, 422: ErrorOut})
def edit_department(request, dept_id: int, payload: DepartmentIn):
    dept = _mine(request, Department, dept_id)

    def go():
        d = structure.save_department(request.user, dept, **payload.dict())
        return Status(200, {"id": d.pk, "name": d.name, "code": d.code,
                            "courses": d.courses.count()})
    return _call(go)


@router.post("/programs", response={201: ProgramOut, 403: ErrorOut, 422: ErrorOut})
def add_program(request, payload: ProgramIn):
    return _call(lambda: Status(201, structure.save_program(request.user, None, **payload.dict())))


@router.post("/courses", response={201: CourseOut, 403: ErrorOut, 422: ErrorOut})
def add_course(request, payload: CourseIn):
    return _call(lambda: Status(201, _course_out(
        structure.save_course(request.user, None, **payload.dict()))))


@router.put("/courses/{course_id}", response={200: CourseOut, 403: ErrorOut, 422: ErrorOut})
def edit_course(request, course_id: int, payload: CourseIn):
    course = _mine(request, Course, course_id)
    return _call(lambda: Status(200, _course_out(
        structure.save_course(request.user, course, **payload.dict()))))


@router.get("/sections", response=list[SectionRowOut])
def sections(request, term_id: int | None = None):
    _guard(request)
    qs = _sections(request)
    if term_id:
        qs = qs.filter(offering__term_id=term_id)
    qs = qs.annotate(n=Count("enrollments", filter=Q(enrollments__status="active")))
    teachers: dict[int, list[str]] = {}
    for t in TeacherAssignment.objects.filter(section__in=qs).select_related("teacher"):
        teachers.setdefault(t.section_id, []).append(str(t.teacher))
    return [_row(s, teachers.get(s.pk, []), s.n)
            for s in qs.order_by("offering__course__code", "code")]


@router.post("/sections", response={201: SectionDetailOut, 403: ErrorOut, 422: ErrorOut})
def add_section(request, payload: SectionIn):
    _guard(request)
    return _call(lambda: Status(201, _detail(structure.create_section(request.user,
                                                                      **payload.dict()))))


def _section(request, section_id: int) -> Section:
    _guard(request)
    section = _sections(request).filter(pk=section_id).first()
    if section is None:
        raise HttpError(404, "Section not found")
    return section


@router.get("/sections/{section_id}", response=SectionDetailOut)
def section_detail(request, section_id: int):
    return _detail(_section(request, section_id))


@router.patch("/sections/{section_id}",
              response={200: SectionDetailOut, 403: ErrorOut, 422: ErrorOut})
def edit_section(request, section_id: int, payload: SectionPatch):
    section = _section(request, section_id)
    program = None if payload.clear_program else (payload.program_id or ...)

    def go():
        structure.update_section(request.user, section, code=payload.code, program_id=program,
                                 status=payload.status)
        return Status(200, _detail(_section(request, section_id)))
    return _call(go)


@router.post("/sections/{section_id}/teachers",
             response={200: SectionDetailOut, 403: ErrorOut, 422: ErrorOut})
def add_teacher(request, section_id: int, payload: TeacherIn):
    section = _section(request, section_id)
    return _call(lambda: (structure.assign_teacher(request.user, section, payload.user_id,
                                                   payload.role),
                          Status(200, _detail(section)))[1])


@router.delete("/sections/{section_id}/teachers/{user_id}",
               response={200: SectionDetailOut, 403: ErrorOut})
def drop_teacher(request, section_id: int, user_id: int):
    section = _section(request, section_id)
    return _call(lambda: (structure.remove_teacher(request.user, section, user_id),
                          Status(200, _detail(section)))[1])


@router.post("/sections/{section_id}/students",
             response={200: SectionDetailOut, 403: ErrorOut, 422: ErrorOut})
def add_students(request, section_id: int, payload: EnrollIn):
    section = _section(request, section_id)
    return _call(lambda: (structure.enroll(request.user, section, payload.user_ids),
                          Status(200, _detail(section)))[1])


@router.patch("/sections/{section_id}/students/{user_id}",
              response={200: SectionDetailOut, 403: ErrorOut, 422: ErrorOut})
def change_enrollment(request, section_id: int, user_id: int, payload: EnrollmentPatch):
    section = _section(request, section_id)
    return _call(lambda: (structure.set_enrollment(request.user, section, user_id,
                                                   payload.status),
                          Status(200, _detail(section)))[1])


@router.get("/people", response=list[PersonOut])
def find_people(request, kind: str = "student", q: str = ""):
    """Search for teachers or students to add to a section (coordinators can use it too)."""
    from apps.identity.models import User

    _guard(request)
    qs = User.objects.filter(institution_id=request.user.institution_id, is_active=True)
    qs = qs.filter(kind=User.Kind.STUDENT) if kind == "student" else qs.exclude(
        kind=User.Kind.STUDENT)
    q = q.strip()
    if q:
        qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q)
                       | Q(email__icontains=q) | Q(external_id__iexact=q))
    return [_person(u) for u in qs.order_by("first_name", "last_name")[:20]]
