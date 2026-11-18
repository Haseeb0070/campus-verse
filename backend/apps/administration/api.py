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

from . import imports, people, sources
from .models import ImportRun, SyncSource
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
    first_name: str = ""
    last_name: str = ""
    external_id: str = ""
    two_step: bool = False
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
    term: str | None
    source: str | None
    held_reason: str
    created_at: datetime
    created_by: str
    applied_at: datetime | None
    summary: dict
    result: dict
    rows: list[dict] | None = None
    not_in_file: list[str] | None = None


class SourceOut(Schema):
    id: int
    name: str
    kind: str
    url: str
    has_auth: bool
    purpose: str
    schedule: str
    auto_apply: bool
    is_active: bool
    owner: str
    owner_id: int
    last_attempt_at: datetime | None
    last_success_at: datetime | None
    last_error: str


class SourceIn(Schema):
    name: str
    kind: str
    url: str
    schedule: str = "daily"
    auto_apply: bool = False
    purpose: str = ""
    auth_header: str | None = None
    owner_id: int | None = None
    is_active: bool = True


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
        "first_name": u.first_name,
        "last_name": u.last_name,
        "external_id": u.external_id,
        "two_step": u.authenticator_set.exists(),
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
        "term": run.term.name if run.term else None,
        "source": run.source.name if run.source else None,
        "held_reason": run.held_reason,
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


class PersonUpdateIn(Schema):
    first_name: str
    last_name: str = ""
    email: str
    kind: str
    external_id: str = ""


@router.patch("/people/{person_id}", response=PERSON)
def update_person(request, person_id: int, payload: PersonUpdateIn):
    _admin(request)
    person = _person(request, person_id)

    def go():
        people.update_person(request.user, person, **payload.dict())
        return _person_out(User.objects.get(pk=person.pk))

    return _call(go)


class ResetLinkOut(Schema):
    link: str


@router.post("/people/{person_id}/password-reset", response={200: ResetLinkOut, 403: ErrorOut,
                                                            422: ErrorOut})
def password_reset(request, person_id: int):
    """Emails the person a link to choose a new password, and returns it to pass on in person."""
    _admin(request)
    person = _person(request, person_id)
    return _call(lambda: {"link": people.password_reset_link(request.user, person)})


@router.post("/people/{person_id}/reset-two-step", response=DONE)
def reset_two_step(request, person_id: int):
    _admin(request)
    person = _person(request, person_id)
    return _call(lambda: (people.reset_two_step(request.user, person), Status(204, None))[1])


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


def _template(kind: str) -> HttpResponse:
    response = HttpResponse(imports.kind_of(kind).template, content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{kind}-template.csv"'
    return response


@router.get("/imports/template.csv", auth=None, include_in_schema=False)
def template(request):
    return _template(ImportRun.Kind.TIMETABLE)


@router.get("/imports/{kind}/template.csv", auth=None, include_in_schema=False)
def kind_template(request, kind: str):
    if kind not in ImportRun.Kind.values:
        raise HttpError(404, "Unknown kind of import")
    return _template(kind)


@router.get("/imports", response=list[ImportOut])
def list_imports(request):
    _admin(request)
    runs = ImportRun.objects.filter(institution_id=request.user.institution_id).select_related(
        "source_file", "term", "created_by", "source"
    )[:30]
    return [_run_out(r, detail=False) for r in runs]


def _run(request, run_id: int) -> ImportRun:
    run = ImportRun.objects.filter(
        pk=run_id, institution_id=request.user.institution_id
    ).select_related("source_file", "term", "created_by", "source").first()
    if run is None:
        raise HttpError(404, "Import not found")
    return run


# GET /imports/{key} reads a run by number; POST /imports/{key} uploads a file of that kind.
# They share one path so the router can tell them apart by method.
@router.get("/imports/{key}", response=ImportOut)
def get_import(request, key: int):
    _admin(request)
    return _run_out(_run(request, key), detail=True)


@router.post("/imports/{key}", response={201: ImportOut, 403: ErrorOut, 422: ErrorOut})
def upload(request, key: str, file: File[UploadedFile]):
    """Preview a CSV or Excel file of one kind: timetable, people or enrollment."""
    _admin(request)
    kind = key
    if kind not in ImportRun.Kind.values:
        raise HttpError(404, "Unknown kind of import")
    return _call(lambda: Status(201, _run_out(imports.preview(request.user, file, kind),
                                              detail=True)))


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


# Sync sources -------------------------------------------------------------------------------


def _source_out(src: SyncSource) -> dict:
    return {
        "id": src.pk, "name": src.name, "kind": src.kind, "url": src.url,
        "has_auth": bool(src.auth_header), "purpose": src.purpose, "schedule": src.schedule,
        "auto_apply": src.auto_apply, "is_active": src.is_active, "owner": str(src.owner),
        "owner_id": src.owner_id, "last_attempt_at": src.last_attempt_at,
        "last_success_at": src.last_success_at, "last_error": src.last_error,
    }


def _source(request, source_id: int) -> SyncSource:
    src = SyncSource.objects.filter(
        pk=source_id, institution_id=request.user.institution_id
    ).select_related("owner").first()
    if src is None:
        raise HttpError(404, "Source not found")
    return src


@router.get("/sync-sources", response=list[SourceOut])
def list_sources(request):
    _admin(request)
    return [_source_out(s) for s in SyncSource.objects.filter(
        institution_id=request.user.institution_id).select_related("owner")]


@router.post("/sync-sources", response={201: SourceOut, 403: ErrorOut, 422: ErrorOut})
def add_source(request, payload: SourceIn):
    _admin(request)
    return _call(lambda: Status(201, _source_out(
        sources.save_source(request.user, None, **payload.dict()))))


@router.put("/sync-sources/{source_id}", response={200: SourceOut, 403: ErrorOut, 422: ErrorOut})
def edit_source(request, source_id: int, payload: SourceIn):
    _admin(request)
    src = _source(request, source_id)
    return _call(lambda: Status(200, _source_out(
        sources.save_source(request.user, src, **payload.dict()))))


@router.post("/sync-sources/{source_id}/run",
             response={200: ImportOut, 403: ErrorOut, 422: ErrorOut})
def run_source(request, source_id: int):
    _admin(request)
    src = _source(request, source_id)

    def go():
        run = sources.run_now(request.user, src)
        if run is None:
            src.refresh_from_db()
            return Status(422, {"detail": src.last_error or "The sync failed."})
        return Status(200, _run_out(run, detail=True))
    return _call(go)


class ThemeIO(Schema):
    preset: str
    guide_enabled: bool
    guide_name: str
    guide_body: str = ""
    guide_cap: str = ""
    guide_tassel: str = ""
    helper_enabled: bool = True
    custom: dict = {}


@router.get("/theme", response={200: ThemeIO, 403: ErrorOut})
def get_theme(request):
    _admin(request)
    from apps.academic.theme import theme_of

    return theme_of(request.user.institution)


@router.put("/theme", response={200: ThemeIO, 403: ErrorOut, 422: ErrorOut})
def set_theme(request, payload: ThemeIO):
    """The whole site's look: a built-in theme and the landing page's guide."""
    _admin(request)
    from apps.academic.theme import clean_theme, theme_of
    from apps.governance import audit

    institution = request.user.institution
    try:
        cleaned = clean_theme(payload.dict())
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    before = theme_of(institution)
    institution.theme = cleaned
    institution.save(update_fields=["theme", "updated_at"])
    changed = {k: [before.get(k), v] for k, v in cleaned.items() if before.get(k) != v}
    if changed:
        audit.record(actor=request.user, action="institution.theme_changed", target=institution,
                     changes=changed)
    return Status(200, cleaned)


@router.get("/people.csv", response={200: None, 403: ErrorOut})
def people_csv(request, kind: str = ""):
    """Everyone at the institution (or one kind), with their roles and when they last signed in."""
    from apps.core.exports import csv_response

    _admin(request)
    qs = User.objects.filter(institution_id=request.user.institution_id)
    if kind in User.Kind.values:
        qs = qs.filter(kind=kind)
    rows = []
    for u in qs.prefetch_related("roles__department").order_by("kind", "first_name", "last_name"):
        roles = ", ".join(
            r.role.replace("_", " ") + (f" ({r.department.name})" if r.department else "")
            for r in u.roles.all()
        )
        rows.append([u.external_id, u.first_name, u.last_name, u.email, u.kind,
                     "Active" if u.is_active else "Deactivated",
                     "Invited" if not u.has_usable_password() else "Signed up", roles,
                     u.last_login.strftime("%Y-%m-%d") if u.last_login else "Never"])
    return csv_response("people.csv", ["College ID", "First name", "Last name", "Email", "Type",
                                       "Status", "Account", "Roles", "Last signed in"], rows)


@router.get("/reports.csv", response={200: None, 403: ErrorOut})
def reports_csv(request, days: int = 30):
    """The report as rows: each part of it under its own name, ready for a spreadsheet."""
    from apps.core.exports import csv_response

    from .reports import build

    _admin(request)
    data = build(request.user, days)
    rows = [("Period", f"Last {data['days']} days", "", "")]
    p = data["people"]
    rows += [("People", "Students", p["students"], f"{p['active']['students']} active"),
             ("People", "Teachers", p["teachers"], f"{p['active']['teachers']} active"),
             ("People", "Staff", p["staff"], f"{p['active']['staff']} active"),
             ("People", "Invited, not signed up", p["invited"], "")]
    for n in data["notices"]:
        rate = "" if n["read_rate"] is None else f"{n['read_rate']}% read"
        rows.append(("Notice", n["title"], n["reached"], rate))
    for a in data["assignments"]["rows"]:
        rate = "" if a["submission_rate"] is None else f"{a['submission_rate']}% handed in"
        rows.append(("Assignment", f"{a['title']} ({a['section']})", a["submitted"], rate))
    for s in (data["attendance"] or {}).get("sections", []):
        rate = "" if s["rate"] is None else f"{s['rate']}%"
        rows.append(("Attendance", s["section"], s["records"], rate))
    for r in data["resources"]["top"]:
        rows.append(("Resource", f"{r['title']} ({r['course']})", r["downloads"],
                     f"{r['people']} people"))
    return csv_response(f"report last {data['days']} days.csv",
                        ["Part", "Item", "Count", "Detail"], rows)


@router.get("/reports", response=dict)
def get_reports(request, days: int = 30):
    """Summaries for one period (7, 30 or 90 days); counts and rates only (SRS 12.1)."""
    from . import reports

    _admin(request)
    return reports.build(request.user, days)
