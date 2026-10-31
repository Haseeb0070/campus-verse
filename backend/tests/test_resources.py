import pytest
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.academic.models import Course, CourseOffering, Section
from apps.core.models import StoredFile
from apps.governance.models import AuditLog
from apps.notifications import services as notifications
from apps.notifications.models import Notification
from apps.resources import services
from apps.resources.models import Resource

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


@pytest.fixture(autouse=True)
def quiet(monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


@pytest.fixture
def commits(django_capture_on_commit_callbacks):
    return lambda: django_capture_on_commit_callbacks(execute=True)


def pdf(name="week-5.pdf", body=PDF):
    return SimpleUploadedFile(name, body, content_type="application/pdf")


def share(campus, *, user=None, targets=None, **kw):
    fields = {"title": "Week 5 slides", "kind": "slides", "upload": pdf()} | kw
    return services.create_resource(
        user or campus.teacher, offering=campus.offering,
        targets=targets or [("section", campus.s3b.pk)], **fields,
    )


def visible(user, **kw):
    return list(services.visible_resources(user, **kw))


def titles(user):
    return list(Notification.objects.filter(recipient=user).values_list("title", "body"))


# Sharing and seeing ---------------------------------------------------------------------------


def test_only_the_sections_it_is_shared_with_see_it(campus):
    r = share(campus)
    assert visible(campus.ayesha) == [r]  # 3B
    assert visible(campus.teacher) == [r]
    assert visible(campus.hamza) == []  # 3C
    assert visible(campus.outsider) == []
    assert visible(campus.admin) == [r]  # admins oversee every course, member or not


def test_teachers_share_only_with_sections_they_teach(campus):
    with pytest.raises(PermissionDenied):
        share(campus, targets=[("section", campus.s3c.pk)])
    with pytest.raises(PermissionDenied):  # the whole course needs a coordinator or admin
        share(campus, targets=[("offering", campus.offering.pk)])
    with pytest.raises(PermissionDenied):  # students don't share course material
        share(campus, user=campus.ayesha)
    whole = share(campus, user=campus.admin, targets=[("offering", campus.offering.pk)])
    assert whole in visible(campus.hamza)


def test_targets_must_belong_to_the_chosen_course(campus):
    other = CourseOffering.objects.create(
        institution=campus.inst, term=campus.offering.term,
        course=Course.objects.create(institution=campus.inst, department=campus.cs,
                                     code="CS-110", title="Programming"),
    )
    elsewhere = Section.objects.create(institution=campus.inst, offering=other, code="1A")
    with pytest.raises(ValidationError, match="sections of the course"):
        share(campus, user=campus.admin, targets=[("section", elsewhere.pk)])


@pytest.mark.parametrize(
    ("kw", "error"),
    [
        ({"upload": None}, "Attach a file or add a link"),
        ({"url": "https://example.com"}, "not both"),
        ({"upload": None, "url": "javascript:alert(1)"}, "full web addresses"),
        ({"upload": None, "url": "example.com/notes"}, "full web addresses"),
        ({"title": "  "}, "title"),
        ({"kind": "meme"}, "what kind"),
        ({"upload": pdf("slides.pdf", b"MZ\x90 not a pdf")}, "doesn't look like a real .pdf"),
        ({"upload": SimpleUploadedFile("run.exe", b"MZ")}, "isn't allowed"),
    ],
)
def test_bad_resources_are_refused_before_anything_is_saved(campus, kw, error):
    with pytest.raises(ValidationError, match=error):
        share(campus, **kw)
    assert not Resource.objects.exists()
    assert not StoredFile.objects.exists()


def test_links_are_resources_too(campus):
    r = share(campus, upload=None, url=" https://visualgo.net/en/list ", kind="reference")
    assert r.url == "https://visualgo.net/en/list"
    assert not r.versions.exists()


def test_filters_by_course_kind_and_text(campus):
    slides = share(campus)
    reading = share(campus, title="Chapter 4", kind="reading", upload=None,
                    url="https://example.com/ch4", description="Read before the quiz")
    assert visible(campus.ayesha, kind="reading") == [reading]
    assert visible(campus.ayesha, q="quiz") == [reading]
    assert visible(campus.ayesha, q="SLIDES") == [slides]
    assert visible(campus.ayesha, offering_id=campus.offering.pk + 99) == []


# Versions and archiving -----------------------------------------------------------------------


def test_replacing_keeps_the_old_file_for_teachers_only(campus):
    r = share(campus)
    v1 = r.versions.get()
    v2 = services.replace_file(campus.teacher, r, pdf("week-5-fixed.pdf"), note="Fixed slide 12")
    assert (v2.number, v2.note) == (2, "Fixed slide 12")
    assert services.current_version(services.get_resource_for(campus.ayesha, r.pk)) == v2

    assert services.downloadable_version(campus.ayesha, v2.file_id) == v2
    assert services.downloadable_version(campus.ayesha, v1.file_id) is None  # superseded
    assert services.downloadable_version(campus.teacher, v1.file_id) == v1
    assert services.downloadable_version(campus.hamza, v2.file_id) is None
    assert services.downloadable_version(campus.outsider, v2.file_id) is None

    with pytest.raises(PermissionDenied):
        services.replace_file(campus.ayesha, r, pdf())
    link = share(campus, upload=None, url="https://example.com")
    with pytest.raises(ValidationError, match="Edit the link"):
        services.replace_file(campus.teacher, link, pdf())


def test_archived_material_stays_findable(campus):
    r = share(campus)
    with pytest.raises(PermissionDenied):
        services.set_archived(campus.ayesha, r, True)
    services.set_archived(campus.teacher, r, True)
    assert visible(campus.ayesha) == []
    assert visible(campus.ayesha, status="archived") == [r]
    assert services.downloadable_version(campus.ayesha, r.versions.get().file_id) is not None
    with pytest.raises(ValidationError, match="Restore"):
        services.replace_file(campus.teacher, r, pdf())
    services.set_archived(campus.teacher, r, False)
    assert visible(campus.ayesha) == [r]


def test_editing_details(campus):
    r = share(campus)
    services.update_details(campus.teacher, r, title="Week 5: Trees", description="",
                            kind="slides")
    assert Resource.objects.get().title == "Week 5: Trees"
    with pytest.raises(ValidationError, match="Upload a new version"):
        services.update_details(campus.teacher, r, title="x", description="", kind="slides",
                                url="https://example.com")
    with pytest.raises(PermissionDenied):
        services.update_details(campus.ayesha, r, title="mine", description="", kind="slides")


def test_sensitive_changes_are_audited(campus):
    r = share(campus)
    services.replace_file(campus.teacher, r, pdf(), note="v2")
    services.set_archived(campus.teacher, r, True)
    assert list(AuditLog.objects.order_by("id").values_list("action", flat=True)) == [
        "resource.shared", "resource.replaced", "resource.archived",
    ]


# Notifications --------------------------------------------------------------------------------


def test_students_hear_about_new_and_updated_material_once(campus, commits):
    with commits():
        r = share(campus)
    assert titles(campus.ayesha) == [("New in CS-301: Week 5 slides", "Lecture slides")]
    assert titles(campus.teacher) == []  # not for your own upload
    assert titles(campus.hamza) == []

    with commits():
        services.replace_file(campus.teacher, r, pdf(), note="Fixed slide 12")
    assert ("Updated in CS-301: Week 5 slides", "Fixed slide 12") in titles(campus.ayesha)

    notifications.resource_shared(r.pk)  # a retried job
    assert len(titles(campus.ayesha)) == 2


def test_archived_resources_send_nothing(campus):
    r = share(campus)
    services.set_archived(campus.teacher, r, True)
    assert notifications.resource_shared(r.pk) == 0


# API ------------------------------------------------------------------------------------------


def test_sharing_and_downloading_through_the_api(client, campus):
    client.force_login(campus.teacher)
    options = client.get("/api/resources/options").json()
    assert [c["course_code"] for c in options["courses"]] == ["CS-301"]
    assert [s["code"] for s in options["courses"][0]["sections"]] == ["3B"]
    assert options["courses"][0]["whole_course"] is False

    created = client.post("/api/resources", {
        "offering_id": campus.offering.pk, "title": "Week 5 slides", "kind": "slides",
        "targets": [f"section:{campus.s3b.pk}"], "file": pdf(),
    })
    assert created.status_code == 201, created.json()
    body = created.json()
    assert body["audiences"] == ["CS-301 · 3B"] and body["version"] == 1
    assert body["can_manage"] and len(body["versions"]) == 1
    rid, fid = body["id"], body["file"]["id"]

    replaced = client.post(f"/api/resources/{rid}/versions", {"file": pdf("v2.pdf"),
                                                              "note": "Typos"})
    assert replaced.status_code == 201 and replaced.json()["version"] == 2

    client.force_login(campus.ayesha)
    mine = client.get(f"/api/resources/{rid}").json()
    assert mine["can_manage"] is False and mine["versions"] == []  # no history for students
    download = client.get(f"/api/resources/files/{mine['file']['id']}")
    assert download.status_code == 200
    assert download["Cache-Control"] == "private, no-store"
    assert b"".join(download.streaming_content) == PDF
    assert client.get(f"/api/resources/files/{fid}").status_code == 404  # old version
    assert client.post(f"/api/resources/{rid}/archive").status_code == 403

    client.force_login(campus.hamza)
    assert client.get(f"/api/resources/{rid}").status_code == 404
    assert client.get(f"/api/resources/files/{mine['file']['id']}").status_code == 404
    assert client.get("/api/resources").json() == []


def test_api_rejects_bad_input_clearly(client, campus):
    client.force_login(campus.teacher)
    bad = client.post("/api/resources", {"offering_id": campus.offering.pk, "title": "x",
                                         "kind": "slides", "targets": ["section:nope"],
                                         "url": "https://example.com"})
    assert bad.status_code == 422 and bad.json()["detail"] == "Choose who can see it."
    other = client.post("/api/resources", {"offering_id": 99999, "title": "x", "kind": "slides",
                                           "url": "https://example.com"})
    assert other.status_code == 404


def test_demo_resources_include_every_state(db, settings):
    from io import StringIO

    from django.core.management import call_command

    settings.DEBUG = True
    call_command("seed_demo", stdout=StringIO())
    states = {r.title: (r.status, r.versions.count()) for r in Resource.objects.all()}
    assert states["Week 5: Binary search trees"] == ("active", 2)
    assert states["VisuAlgo: linked lists"] == ("active", 0)
    assert states["Week 1 slides (old syllabus)"][0] == "archived"
    pdf_file = Resource.objects.get(title__startswith="Week 5").versions.first().file
    with pdf_file.file.open("rb") as f:
        body = f.read()
    assert body.startswith(b"%PDF-1.4") and body.rstrip().endswith(b"%%EOF")
    assert b"slide 14 fixed" in body
