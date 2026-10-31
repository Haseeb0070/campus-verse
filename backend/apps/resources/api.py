from datetime import datetime
from typing import Literal

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.http import FileResponse
from ninja import File, Form, Query, Router, Schema, Status
from ninja.errors import HttpError
from ninja.files import UploadedFile

from apps.academic.models import CourseOffering
from apps.core.audience import parse_target
from apps.core.files import ACCEPT
from apps.core.models import StoredFile

from . import services
from .models import Resource, ResourceDownload, ResourceVersion

router = Router(tags=["resources"])

KindLiteral = Literal["slides", "notes", "reading", "reference", "other"]


class FileOut(Schema):
    id: int
    name: str
    size: int
    content_type: str


class VersionOut(Schema):
    number: int
    file: FileOut
    note: str
    uploaded_by: str
    created_at: datetime


class ResourceOut(Schema):
    id: int
    title: str
    description: str
    kind: str
    kind_label: str
    status: str
    archived_at: datetime | None
    offering_id: int
    course_code: str
    course_title: str
    color: str
    term: str
    audiences: list[str]
    url: str
    file: FileOut | None
    version: int
    shared_by: str
    created_at: datetime
    updated_at: datetime
    can_manage: bool
    # Every version, newest first; only for people who manage the resource.
    versions: list[VersionOut] = []


class ResourceQuery(Schema):
    status: Literal["active", "archived", "all"] = "active"
    offering: int | None = None
    kind: str = ""
    q: str = ""


class SectionOptionOut(Schema):
    key: str
    code: str
    reach: int


class CourseOptionOut(Schema):
    offering_id: int
    course_code: str
    course_title: str
    color: str
    term: str
    whole_course: bool
    sections: list[SectionOptionOut]


class OptionsOut(Schema):
    courses: list[CourseOptionOut]
    accept: str
    max_mb: int


class DetailsIn(Schema):
    title: str
    description: str = ""
    kind: KindLiteral
    url: str | None = None


class ErrorOut(Schema):
    detail: str


def _file(f: StoredFile) -> dict:
    return {"id": f.pk, "name": f.original_name, "size": f.size, "content_type": f.content_type}


def _version(v: ResourceVersion) -> dict:
    return {
        "number": v.number, "file": _file(v.file), "note": v.note,
        "uploaded_by": v.uploaded_by.get_full_name() or v.uploaded_by.email,
        "created_at": v.created_at,
    }


def _out(r: Resource, user, *, detail: bool = False) -> dict:
    course = r.offering.course
    current = services.current_version(r)
    manage = services.can_manage(user, r)
    return {
        "id": r.pk,
        "title": r.title,
        "description": r.description,
        "kind": r.kind,
        "kind_label": r.get_kind_display(),
        "status": r.status,
        "archived_at": r.archived_at,
        "offering_id": r.offering_id,
        "course_code": course.code,
        "course_title": course.title,
        "color": course.color,
        "term": r.offering.term.name,
        "audiences": services.audience_labels(r),
        "url": r.url,
        "file": _file(current.file) if current else None,
        "version": current.number if current else 1,
        "shared_by": r.created_by.get_full_name() or r.created_by.email,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
        "can_manage": manage,
        "versions": [_version(v) for v in r.versions.all()] if detail and manage else [],
    }


def _get(request, resource_id: int) -> Resource:
    try:
        return services.get_resource_for(request.user, resource_id)
    except Resource.DoesNotExist:
        raise HttpError(404, "Resource not found") from None


def _call(fn):
    try:
        return fn()
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


@router.get("", response=list[ResourceOut])
def list_resources(request, query: Query[ResourceQuery]):
    resources = services.visible_resources(
        request.user, status=query.status, offering_id=query.offering, kind=query.kind, q=query.q
    )
    return [_out(r, request.user) for r in resources]


@router.get("/options", response=OptionsOut)
def options(request):
    """Where you can share material, and the upload rules for the form."""
    return {
        "courses": services.share_options(request.user),
        "accept": ACCEPT,
        "max_mb": settings.CAMPUSVERSE_MAX_UPLOAD_MB,
    }


@router.post("", response={201: ResourceOut, 403: ErrorOut, 422: ErrorOut})
def create(
    request,
    offering_id: Form[int],
    title: Form[str],
    kind: Form[KindLiteral],
    targets: Form[list[str]] = None,
    description: Form[str] = "",
    url: Form[str] = "",
    file: File[UploadedFile] = None,
):
    offering = CourseOffering.objects.filter(
        pk=offering_id, institution_id=request.user.institution_id
    ).first()
    if offering is None:
        raise HttpError(404, "Course not found")
    try:
        parsed = [parse_target(t) for t in (targets or [])]
    except ValueError:
        return Status(422, {"detail": "Choose who can see it."})

    def go():
        r = services.create_resource(
            request.user, offering=offering, title=title, kind=kind, targets=parsed,
            description=description, upload=file, url=url,
        )
        return Status(201, _out(services.get_resource_for(request.user, r.pk), request.user,
                                detail=True))

    return _call(go)


@router.get("/{resource_id}", response=ResourceOut)
def detail(request, resource_id: int):
    return _out(_get(request, resource_id), request.user, detail=True)


@router.patch("/{resource_id}", response={200: ResourceOut, 403: ErrorOut, 422: ErrorOut})
def edit(request, resource_id: int, payload: DetailsIn):
    r = _get(request, resource_id)

    def go():
        services.update_details(request.user, r, title=payload.title,
                                description=payload.description, kind=payload.kind,
                                url=payload.url)
        return Status(200, _out(_get(request, resource_id), request.user, detail=True))

    return _call(go)


@router.post("/{resource_id}/versions",
             response={201: ResourceOut, 403: ErrorOut, 422: ErrorOut})
def replace(request, resource_id: int, file: File[UploadedFile], note: Form[str] = ""):
    r = _get(request, resource_id)

    def go():
        services.replace_file(request.user, r, file, note=note)
        return Status(201, _out(_get(request, resource_id), request.user, detail=True))

    return _call(go)


@router.post("/{resource_id}/archive", response={200: ResourceOut, 403: ErrorOut})
def archive(request, resource_id: int):
    r = _get(request, resource_id)
    return _call(lambda: Status(200, _out(services.set_archived(request.user, r, True),
                                          request.user, detail=True)))


@router.post("/{resource_id}/restore", response={200: ResourceOut, 403: ErrorOut})
def restore(request, resource_id: int):
    r = _get(request, resource_id)
    return _call(lambda: Status(200, _out(services.set_archived(request.user, r, False),
                                          request.user, detail=True)))


@router.get("/files/{file_id}", response={200: None})
def download(request, file_id: int):
    version = services.downloadable_version(request.user, file_id)
    # Same 404 whether it doesn't exist or isn't yours: no probing for file IDs (SRS 9.2).
    if version is None:
        raise HttpError(404, "File not found")
    ResourceDownload.objects.create(institution_id=version.institution_id,
                                    resource_id=version.resource_id, user=request.user)
    stored = version.file
    response = FileResponse(
        stored.file.open("rb"),
        as_attachment=not stored.content_type.startswith("image/"),
        filename=stored.original_name,
        content_type=stored.content_type,
    )
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response
