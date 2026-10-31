from datetime import date, datetime

from django.core.exceptions import PermissionDenied, ValidationError
from django.db.models import Count, Q
from django.http import HttpResponse
from ninja import File, Router, Schema, Status
from ninja.errors import HttpError
from ninja.files import UploadedFile

from apps.academic.models import Department
from apps.chat.serializers import initials
from apps.governance.models import AuditLog
from apps.identity import profile
from apps.identity.api import CorrectionOut, correction_out
from apps.identity.models import CorrectionRequest, RoleAssignment, User
from apps.identity.roles import is_institution_admin

from . import imports, people
from .models import ImportRun
from .overview import overview

router = Router(tags=["manage"])


class ErrorOut(Schema):
    detail: str


class ClashOut(Schema):
    room: str
    date: date
    time: str
    classes: list[str]


class OverviewOut(Schema):
    students: int
    teachers: int
    staff: int
    invited: int
    signed_in_week: int
    active_people: int
    sections: int
    departments: int
    pending_imports: int
    room_clashes: list[ClashOut]


class RoleOut(Schema):
    id: int
    role: str
    department: str | None


class PersonOut(Schema):
    id: int
    email: str
    name: str
    initials: str
    kind: str
    is_active: bool
    invited: bool
    last_login: datetime | None
    sections: int
    roles: list[RoleOut]


class InviteIn(Schema):
    email: str
    first_name: str
    last_name: str = ""
    kind: str = "student"


class RoleIn(Schema):
    role: str
    department_id: int | None = None


class DepartmentOut(Schema):
    id: int
    name: str
    code: str


class ImportOut(Schema):
    id: int
    kind: str
    status: str
    file_name: str
    term: str
    created_at: datetime
    created_by: str
    applied_at: datetime | None
    summary: dict
    result: dict
    rows: list[dict] | None = None
    not_in_file: list[str] | None = None


class AuditOut(Schema):
    id: int
    created_at: datetime
    action: str
    actor: str | None
    target_type: str
    target_id: str
    changes: dict


class ManageCorrectionOut(CorrectionOut):
    person: PersonOut


class ResolveCorrectionIn(Schema):
    status: str
    response: str = ""


PERSON = {200: PersonOut, 403: ErrorOut, 422: ErrorOut}
DONE = {204: None, 403: ErrorOut, 422: ErrorOut}


def _admin(request):
    if not is_institution_admin(request.user):
        raise HttpError(403, "Only institution admins can do this.")


def _person(request, person_id: int) -> User:
    person = User.objects.filter(pk=person_id, institution_id=request.user.institution_id).first()
    if person is None:
        raise HttpError(404, "Person not found")
    return person


def _person_out(u: User) -> dict:
    return {
        "id": u.pk,
        "email": u.email,
        "name": u.get_full_name() or u.email,
        "initials": initials(u),
        "kind": u.kind,
        "is_active": u.is_active,
        "invited": not u.has_usable_password(),
        "last_login": u.last_login,
        "sections": getattr(u, "section_count", 0),
        "roles": [
            {"id": r.pk, "role": r.role, "department": r.department.name if r.department else None}
            for r in u.roles.all()
        ],
    }


def _run_out(run: ImportRun, *, detail: bool) -> dict:
    return {
        "id": run.pk,
        "kind": run.kind,
        "status": run.status,
        "file_name": run.source_file.original_name,
        "term": run.term.name,
        "created_at": run.created_at,
        "created_by": str(run.created_by),
        "applied_at": run.applied_at,
        "summary": run.plan.get("summary", {}),
        "result": run.result,
        "rows": run.plan.get("rows") if detail else None,
        "not_in_file": run.plan.get("not_in_file") if detail else None,
    }


def _call(fn):
    try:
        return fn()
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


@router.get("/corrections", response=list[ManageCorrectionOut])
def corrections(request, status: str = "open"):
    _admin(request)
    qs = CorrectionRequest.objects.filter(
        institution_id=request.user.institution_id
    ).select_related("user")
    if status != "all":
        qs = qs.filter(status=status)
    return [
        correction_out(c) | {"person": _person_out(c.user)} for c in qs.order_by("created_at")[:100]
    ]


@router.post("/corrections/{correction_id}/resolve",
             response={200: ManageCorrectionOut, 403: ErrorOut, 422: ErrorOut})
def resolve_correction(request, correction_id: int, payload: ResolveCorrectionIn):
    _admin(request)
    c = CorrectionRequest.objects.filter(
        pk=correction_id, institution_id=request.user.institution_id
    ).select_related("user").first()
    if c is None:
        raise HttpError(404, "Request not found")
    return _call(lambda: Status(200, correction_out(profile.resolve_correction(
        request.user, c, status=payload.status, response=payload.response,
    )) | {"person": _person_out(c.user)}))


@router.get("/overview", response=OverviewOut)
def get_overview(request):
    _admin(request)
    return overview(request.user)


@router.get("/departments", response=list[DepartmentOut])
def departments(request):
    _admin(request)
    return Department.objects.filter(institution_id=request.user.institution_id).order_by("name")


@router.get("/people", response=list[PersonOut])
def list_people(request, q: str = "", kind: str = "", limit: int = 100):
    _admin(request)
    qs = User.objects.filter(institution_id=request.user.institution_id)
    if q:
        qs = qs.filter(
            Q(email__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q)
        )
    if kind in User.Kind.values:
        qs = qs.filter(kind=kind)
    qs = (
        qs.annotate(
            section_count=Count("enrollments", filter=Q(enrollments__status="active"),
                                distinct=True)
            + Count("teaching", distinct=True)
        )
        .prefetch_related("roles__department")
        .order_by("first_name", "last_name", "email")[: max(1, min(limit, 500))]
    )
    return [_person_out(u) for u in qs]


@router.post("/people", response={201: PersonOut, 403: ErrorOut, 422: ErrorOut})
def invite(request, payload: InviteIn):
    _admin(request)
    return _call(lambda: Status(201, _person_out(people.invite(request.user, **payload.dict()))))


@router.post("/people/{person_id}/resend-invite", response=DONE)
def resend(request, person_id: int):
    _admin(request)
    person = _person(request, person_id)
    return _call(lambda: (people.resend_invite(request.user, person), Status(204, None))[1])


@router.post("/people/{person_id}/deactivate", response=PERSON)
def deactivate(request, person_id: int):
    _admin(request)
    person = _person(request, person_id)
    return _call(lambda: (people.set_active(request.user, person, False), _person_out(person))[1])


@router.post("/people/{person_id}/reactivate", response=PERSON)
def reactivate(request, person_id: int):
    _admin(request)
    person = _person(request, person_id)
    return _call(lambda: (people.set_active(request.user, person, True), _person_out(person))[1])


@router.post("/people/{person_id}/roles", response={201: PersonOut, 403: ErrorOut, 422: ErrorOut})
def grant(request, person_id: int, payload: RoleIn):
    _admin(request)
    person = _person(request, person_id)

    def go():
        people.grant_role(request.user, person, role=payload.role,
                          department_id=payload.department_id)
        return Status(201, _person_out(User.objects.get(pk=person.pk)))

    return _call(go)


@router.delete("/roles/{role_id}", response={204: None, 403: ErrorOut, 422: ErrorOut})
def revoke(request, role_id: int):
    _admin(request)
    assignment = RoleAssignment.objects.filter(
        pk=role_id, institution_id=request.user.institution_id
    ).select_related("user").first()
    if assignment is None:
        raise HttpError(404, "Role not found")
    return _call(lambda: (people.revoke_role(request.user, assignment), Status(204, None))[1])


@router.get("/imports/template.csv", auth=None, include_in_schema=False)
def template(request):
    response = HttpResponse(
        ",".join(imports.TEMPLATE_HEADER) + "\nCS-301,3B,Thu,10:30,11:50,B-204,lecture,in_person\n",
        content_type="text/csv",
    )
    response["Content-Disposition"] = 'attachment; filename="timetable-template.csv"'
    return response


@router.get("/imports", response=list[ImportOut])
def list_imports(request):
    _admin(request)
    runs = ImportRun.objects.filter(institution_id=request.user.institution_id).select_related(
        "source_file", "term", "created_by"
    )[:20]
    return [_run_out(r, detail=False) for r in runs]


@router.post("/imports/timetable", response={201: ImportOut, 403: ErrorOut, 422: ErrorOut})
def upload_timetable(request, file: File[UploadedFile]):
    _admin(request)
    return _call(lambda: Status(201, _run_out(imports.preview(request.user, file), detail=True)))


def _run(request, run_id: int) -> ImportRun:
    run = ImportRun.objects.filter(
        pk=run_id, institution_id=request.user.institution_id
    ).select_related("source_file", "term", "created_by").first()
    if run is None:
        raise HttpError(404, "Import not found")
    return run


@router.get("/imports/{run_id}", response=ImportOut)
def get_import(request, run_id: int):
    _admin(request)
    return _run_out(_run(request, run_id), detail=True)


@router.post("/imports/{run_id}/apply", response={200: ImportOut, 403: ErrorOut, 422: ErrorOut})
def apply_import(request, run_id: int):
    _admin(request)
    run = _run(request, run_id)
    return _call(lambda: Status(200, _run_out(imports.apply(request.user, run), detail=True)))


@router.post("/imports/{run_id}/discard", response={200: ImportOut, 403: ErrorOut, 422: ErrorOut})
def discard_import(request, run_id: int):
    _admin(request)
    run = _run(request, run_id)
    return _call(lambda: Status(200, _run_out(imports.discard(request.user, run), detail=True)))


@router.get("/audit", response=list[AuditOut])
def audit_log(request, action: str = "", limit: int = 100):
    _admin(request)
    entries = AuditLog.objects.filter(institution_id=request.user.institution_id).select_related(
        "actor"
    )
    if action:
        entries = entries.filter(action__startswith=action)
    return [
        {
            "id": e.pk,
            "created_at": e.created_at,
            "action": e.action,
            "actor": str(e.actor) if e.actor else None,
            "target_type": e.target_type,
            "target_id": e.target_id,
            "changes": e.changes,
        }
        for e in entries[: max(1, min(limit, 500))]
    ]
