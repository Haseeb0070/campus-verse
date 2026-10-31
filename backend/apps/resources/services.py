from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.validators import URLValidator
from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone

from apps.core.audience import audience_options, can_target, scope_label
from apps.core.files import check_upload, store_upload
from apps.core.models import AudienceScope, AudienceTarget
from apps.governance import audit
from apps.identity.roles import coordinated_department_ids, is_institution_admin
from apps.notifications.tasks import after_commit

from .models import Resource, ResourceVersion

MAX_TITLE = 200
MAX_DESCRIPTION = 2000
MAX_NOTE = 200

_url = URLValidator(schemes=["http", "https"])


# Who sees and who manages ---------------------------------------------------------------------


def _oversight_q(user) -> Q:
    """Admins see every resource in their institution, coordinators those in their departments,
    even for sections they're not a member of."""
    if is_institution_admin(user):
        return Q(institution_id=user.institution_id)
    departments = coordinated_department_ids(user)
    if departments:
        return Q(institution_id=user.institution_id,
                 offering__course__department_id__in=departments)
    return Q(pk__in=[])


def visible_resources(user, *, status: str = "active", offering_id: int | None = None,
                      kind: str = "", q: str = ""):
    """Resources shared with your sections or course, newest first. `status` is active, archived
    or all: archived material stays findable rather than disappearing (SRS 2.1)."""
    if not user.is_authenticated or user.institution_id is None:
        return Resource.objects.none()
    qs = Resource.objects.filter(
        Q(pk__in=Resource.objects.visible_to(user).values("pk")) | _oversight_q(user)
    )
    if status in (Resource.Status.ACTIVE, Resource.Status.ARCHIVED):
        qs = qs.filter(status=status)
    if offering_id:
        qs = qs.filter(offering_id=offering_id)
    if kind:
        qs = qs.filter(kind=kind)
    if q.strip():
        qs = qs.filter(Q(title__icontains=q.strip()) | Q(description__icontains=q.strip()))
    return qs.select_related("offering__course", "offering__term", "created_by").prefetch_related(
        "targets", "versions__file", "versions__uploaded_by"
    )


def get_resource_for(user, resource_id: int) -> Resource:
    resource = visible_resources(user, status="all").filter(pk=resource_id).first()
    if resource is None:
        raise Resource.DoesNotExist
    return resource


def targets_of(resource: Resource) -> list[tuple[str, int]]:
    return [(t.scope_type, t.scope_id) for t in resource.targets.all()]


def audience_labels(resource: Resource) -> list[str]:
    return [scope_label(t, i) for t, i in targets_of(resource)]


def can_manage(user, resource: Resource) -> bool:
    """You manage a resource if you could share it with every audience it's shared with: its
    sections' teachers, the department's coordinators and institution admins."""
    if not user.is_authenticated or resource.institution_id != user.institution_id:
        return False
    targets = targets_of(resource)
    return bool(targets) and all(can_target(user, t, i) for t, i in targets)


def current_version(resource: Resource) -> ResourceVersion | None:
    versions = list(resource.versions.all())  # prefetched, newest first
    return versions[0] if versions else None


def share_options(user) -> list[dict]:
    """Courses you can share material with, and their sections you can pick. Mirrors can_target:
    teachers get the sections they teach; admins and coordinators can also pick the whole course."""
    from apps.academic.models import Section

    picks = {o["scope_id"]: o for o in audience_options(user) if o["scope_type"] == "section"}
    sections = (
        Section.objects.filter(pk__in=picks)
        .select_related("offering__course", "offering__term")
        .order_by("offering__course__code", "code")
    )
    courses: dict[int, dict] = {}
    for s in sections:
        course = s.offering.course
        entry = courses.setdefault(s.offering_id, {
            "offering_id": s.offering_id,
            "course_code": course.code,
            "course_title": course.title,
            "color": course.color,
            "term": s.offering.term.name,
            "whole_course": can_target(user, AudienceScope.OFFERING, s.offering_id),
            "sections": [],
        })
        entry["sections"].append(
            {"key": f"section:{s.pk}", "code": s.code, "reach": picks[s.pk]["reach"]}
        )
    return list(courses.values())


# Validation -----------------------------------------------------------------------------------


def _clean_details(title: str, description: str, kind: str) -> tuple[str, str]:
    title = (title or "").strip()
    description = (description or "").strip()
    if not title:
        raise ValidationError("Give the resource a title.")
    if len(title) > MAX_TITLE:
        raise ValidationError(f"Titles can be up to {MAX_TITLE} characters.")
    if len(description) > MAX_DESCRIPTION:
        raise ValidationError(f"Descriptions can be up to {MAX_DESCRIPTION} characters.")
    if kind not in Resource.Kind.values:
        raise ValidationError("Choose what kind of resource this is.")
    return title, description


def _clean_url(url: str) -> str:
    url = (url or "").strip()
    try:
        _url(url)
    except ValidationError:
        raise ValidationError("Links have to be full web addresses starting with https://.") \
            from None
    return url


def _check_targets(user, offering, targets: list[tuple[str, int]]) -> list[tuple[str, int]]:
    from apps.academic.models import Section

    targets = list(dict.fromkeys(targets))
    if not targets:
        raise ValidationError("Choose who can see it.")
    section_ids = set(
        Section.objects.filter(offering=offering).values_list("pk", flat=True)
    )
    for scope, pk in targets:
        in_course = (scope == AudienceScope.SECTION and pk in section_ids) or (
            scope == AudienceScope.OFFERING and pk == offering.pk
        )
        if not in_course:
            raise ValidationError("Share with sections of the course you picked.")
        if not can_target(user, scope, pk):
            raise PermissionDenied("You can only share with sections you teach.")
    return targets


# Writing --------------------------------------------------------------------------------------


@transaction.atomic
def create_resource(user, *, offering, title: str, kind: str, targets: list[tuple[str, int]],
                    description: str = "", upload=None, url: str = "") -> Resource:
    title, description = _clean_details(title, description, kind)
    if upload and (url or "").strip():
        raise ValidationError("Share a file or a link, not both.")
    if not upload and not (url or "").strip():
        raise ValidationError("Attach a file or add a link.")
    targets = _check_targets(user, offering, targets)
    if upload:
        check_upload(upload)  # before anything is written
    else:
        url = _clean_url(url)

    resource = Resource.objects.create(
        institution_id=offering.institution_id, offering=offering, title=title,
        description=description, kind=kind, url=url if not upload else "", created_by=user,
    )
    ct = ContentType.objects.get_for_model(Resource)
    AudienceTarget.objects.bulk_create(
        AudienceTarget(institution_id=resource.institution_id, content_type=ct,
                       object_id=resource.pk, scope_type=t, scope_id=i)
        for t, i in targets
    )
    if upload:
        ResourceVersion.objects.create(
            institution_id=resource.institution_id, resource=resource, number=1,
            file=store_upload(user, upload), uploaded_by=user,
        )
    audit.record(actor=user, action="resource.shared", target=resource,
                 changes={"targets": [f"{t}:{i}" for t, i in targets]})
    after_commit("resource", resource.pk)
    return resource


@transaction.atomic
def replace_file(user, resource: Resource, upload, *, note: str = "") -> ResourceVersion:
    """Upload a new version. The old one is kept, so nothing useful is silently lost (SRS 5.7)."""
    if not can_manage(user, resource):
        raise PermissionDenied("Only the people who share this resource can replace it.")
    if resource.url:
        raise ValidationError("Links don't have a file to replace. Edit the link instead.")
    if resource.status == Resource.Status.ARCHIVED:
        raise ValidationError("Restore this resource before uploading a new version.")
    note = (note or "").strip()
    if len(note) > MAX_NOTE:
        raise ValidationError(f"Keep the note to {MAX_NOTE} characters.")
    check_upload(upload)
    # Lock the resource row so two uploads at once can't claim the same number.
    Resource.objects.select_for_update().filter(pk=resource.pk).first()
    number = (resource.versions.aggregate(n=Max("number"))["n"] or 0) + 1
    version = ResourceVersion.objects.create(
        institution_id=resource.institution_id, resource=resource, number=number,
        file=store_upload(user, upload), note=note, uploaded_by=user,
    )
    resource.save(update_fields=["updated_at"])
    audit.record(actor=user, action="resource.replaced", target=resource,
                 changes={"version": number, "note": note})
    after_commit("resource", resource.pk)
    return version


@transaction.atomic
def update_details(user, resource: Resource, *, title: str, description: str, kind: str,
                   url: str | None = None) -> Resource:
    if not can_manage(user, resource):
        raise PermissionDenied("Only the people who share this resource can edit it.")
    title, description = _clean_details(title, description, kind)
    changes = {}
    if url is not None and url.strip() != resource.url:
        if not resource.url:
            raise ValidationError("This resource is a file. Upload a new version instead.")
        changes["url"] = [resource.url, _clean_url(url)]
        resource.url = changes["url"][1]
    for field, value in (("title", title), ("kind", kind)):
        if getattr(resource, field) != value:
            changes[field] = [getattr(resource, field), value]
            setattr(resource, field, value)
    if resource.description != description:
        changes["description"] = "changed"
        resource.description = description
    if changes:
        resource.save()
        audit.record(actor=user, action="resource.edited", target=resource, changes=changes)
    return resource


def set_archived(user, resource: Resource, archived: bool) -> Resource:
    if not can_manage(user, resource):
        raise PermissionDenied("Only the people who share this resource can archive it.")
    status = Resource.Status.ARCHIVED if archived else Resource.Status.ACTIVE
    if resource.status != status:
        resource.status = status
        resource.archived_at = timezone.now() if archived else None
        resource.save(update_fields=["status", "archived_at", "updated_at"])
        audit.record(actor=user, action="resource.archived" if archived else "resource.restored",
                     target=resource)
    return resource


# Downloads ------------------------------------------------------------------------------------


def downloadable_version(user, file_id: int) -> ResourceVersion | None:
    """The version behind a file, if this user may download it: the current file for anyone who
    can see the resource, earlier versions only for the people who manage it."""
    version = ResourceVersion.objects.filter(file_id=file_id).select_related("file").first()
    if version is None:
        return None
    try:
        resource = get_resource_for(user, version.resource_id)
    except Resource.DoesNotExist:
        return None
    if version.pk != current_version(resource).pk and not can_manage(user, resource):
        return None
    return version
