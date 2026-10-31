import io
from datetime import date, time, timedelta

import pytest
from django.core import mail
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from openpyxl import Workbook

from apps.administration import imports, sources
from apps.administration.models import ImportRun, SyncSource
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.identity.models import User
from apps.notifications.models import Notification
from apps.scheduling.models import ClassMeeting, Room
from apps.scheduling.services import occurrences


@pytest.fixture(autouse=True)
def quiet(monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


@pytest.fixture
def room(campus):
    return Room.objects.create(institution=campus.inst, code="B-204")


def csv(name, *lines):
    return SimpleUploadedFile(name, ("\n".join(lines) + "\n").encode(), content_type="text/csv")


def xlsx(name, rows):
    book = Workbook()
    for row in rows:
        book.active.append(row)
    out = io.BytesIO()
    book.save(out)
    return SimpleUploadedFile(name, out.getvalue(), content_type="application/zip")


# Excel and the timetable label --------------------------------------------------------------


def test_excel_timetables_and_where_classes_came_from(campus, room):
    upload = xlsx("timetable.xlsx", [
        ["Course code", "Section", "Day", "Start", "End", "Room"],  # headers are forgiving
        ["CS-301", "3B", "Thu", time(10, 30), time(11, 50), "B-204"],
    ])
    run = imports.preview(campus.admin, upload)
    assert run.plan["summary"]["new"] == 1, run.plan["rows"]
    imports.apply(campus.admin, run)
    meeting = ClassMeeting.objects.get()
    assert meeting.last_import == ImportRun.objects.get()

    thursday = timezone.localdate() + timedelta(days=(3 - timezone.localdate().weekday()) % 7)
    occ = next(o for o in occurrences(campus.ayesha, thursday, 1))
    assert occ.source == "Timetable import" and occ.synced_at is not None

    # Unchanged rows in a later import still count as a fresh confirmation.
    again = imports.preview(campus.admin, csv("t.csv", "course_code,section,day,start,end,room",
                                             "CS-301,3B,Thu,10:30,11:50,B-204"))
    again = imports.apply(campus.admin, again)
    meeting.refresh_from_db()
    assert meeting.last_import == again and again.result["confirmed"] == 1


def test_broken_excel_files_are_explained(campus):
    with pytest.raises(ValidationError, match="couldn't be read|isn't a real"):
        imports.preview(campus.admin, SimpleUploadedFile("t.xlsx", b"PK\x03\x04 not really"))
    with pytest.raises(ValidationError, match="missing these columns: room"):
        imports.preview(campus.admin, xlsx("t.xlsx", [["course_code", "section", "day",
                                                       "start", "end"], ["CS-301"]]))
    assert not ImportRun.objects.exists()


# People ----------------------------------------------------------------------------------


def test_people_import_matches_by_id_then_email_and_invites_new_people(
    campus, django_capture_on_commit_callbacks
):
    campus.hamza.external_id = "2023-CS-007"
    campus.hamza.save()
    run = imports.preview(campus.admin, csv(
        "people.csv", "email,first_name,last_name,kind,external_id",
        "new.student@test.edu,Zara,Ali,student,2024-CS-001",
        "hamza@test.edu,Hamza,Malik,student,2023-CS-007",
        "ayesha@test.edu,Ayesha,Khan,student,",
        "not-an-email,X,Y,student,",
        "someone@other.edu,Some,One,student,",
        "imran@test.edu,Imran,Saleem,principal,",
        "zara2@test.edu,Zara,Ali,student,2023-CS-007",
    ), kind="people")
    status = [(r["line"], r["status"]) for r in run.plan["rows"]]
    assert status == [(2, "new"), (3, "update"), (4, "update"), (5, "error"), (6, "error"),
                      (7, "error"), (8, "error")]
    assert "another institution" in run.plan["rows"][4]["message"]
    assert "belongs to hamza@test.edu" in run.plan["rows"][6]["message"]
    with django_capture_on_commit_callbacks(execute=True):
        imports.apply(campus.admin, run)
    zara = User.objects.get(email="new.student@test.edu")
    assert (zara.external_id, zara.kind, zara.institution) == ("2024-CS-001", "student",
                                                               campus.inst)
    assert not zara.has_usable_password()
    assert [m.to for m in mail.outbox] == [["new.student@test.edu"]]  # the invite
    campus.hamza.refresh_from_db()
    assert campus.hamza.last_name == "Malik"
    assert ImportRun.objects.get().result == {"created": 1, "invited": 1, "updated": 2,
                                              "skipped": 4}


# Enrollment ------------------------------------------------------------------------------


def test_enrollment_import(campus):
    campus.ayesha.external_id = "2023-CS-118"
    campus.ayesha.save()
    SectionEnrollment.objects.filter(student=campus.hamza).update(status="dropped")
    run = imports.preview(campus.admin, csv(
        "enrol.csv", "course_code,section,person,role",
        "CS-301,3C,2023-CS-118,student",
        "CS-301,3C,hamza@test.edu,",
        "CS-301,3C,imran@test.edu,teacher",
        "CS-301,3B,2023-CS-118,student",
        "CS-301,9Z,hamza@test.edu,student",
        "CS-301,3C,nobody@test.edu,student",
        "CS-301,3C,imran@test.edu,student",
        "CS-301,3C,ayesha@test.edu,teacher",
    ), kind="enrollment")
    assert [r["status"] for r in run.plan["rows"]] == [
        "new", "update", "new", "unchanged", "error", "error", "error", "error"]
    imports.apply(campus.admin, run)
    assert SectionEnrollment.objects.get(section=campus.s3c, student=campus.ayesha).status == \
        "active"
    assert SectionEnrollment.objects.get(section=campus.s3c, student=campus.hamza).status == \
        "active"
    assert TeacherAssignment.objects.filter(section=campus.s3c, teacher=campus.teacher).exists()


def test_people_missing_from_an_enrollment_file_are_listed_not_dropped(campus):
    run = imports.preview(campus.admin, csv("e.csv", "course_code,section,person",
                                           "CS-301,3B,imran@test.edu"), kind="enrollment")
    assert run.plan["rows"][0]["status"] == "error"  # Imran isn't a student
    run = imports.preview(campus.admin, csv("e.csv", "course_code,section,person,role",
                                           "CS-301,3B,imran@test.edu,teacher"), kind="enrollment")
    assert run.plan["not_in_file"] == ["ayesha@test.edu in CS-301 · 3B"]
    imports.apply(campus.admin, run)
    assert SectionEnrollment.objects.get(student=campus.ayesha).status == "active"


def test_a_changed_plan_is_caught_at_apply_time(campus):
    run = imports.preview(campus.admin, csv("e.csv", "course_code,section,person",
                                           "CS-301,3C,ayesha@test.edu"), kind="enrollment")
    SectionEnrollment.objects.create(institution=campus.inst, section=campus.s3c,
                                     student=campus.ayesha)
    with pytest.raises(ValidationError, match="changed since this preview"):
        imports.apply(campus.admin, run)


# Sync sources ----------------------------------------------------------------------------


def source(campus, **kw):
    fields = {"name": "Registrar timetable", "kind": "timetable",
              "url": "https://registrar.example.edu/export.csv", "schedule": "daily",
              "auto_apply": True} | kw
    return sources.save_source(campus.admin, None, **fields)


def serve(monkeypatch, *lines, error=None):
    def fake(src):
        if error:
            raise error
        return csv("timetable-sync.csv", "course_code,section,day,start,end,room", *lines)
    monkeypatch.setattr(sources, "fetch", fake)


def notes(user):
    return list(Notification.objects.filter(recipient=user, kind="sync.update")
                .values_list("title", flat=True))


def test_sources_are_validated_and_owned_by_admins(campus):
    with pytest.raises(ValidationError, match="https"):
        source(campus, url="http://registrar.example.edu/x.csv")
    with pytest.raises(ValidationError, match="owner"):
        source(campus, owner_id=campus.teacher.pk)
    with pytest.raises(PermissionDenied):
        sources.save_source(campus.teacher, None, name="x", kind="timetable",
                            url="https://x.example.edu", schedule="daily", auto_apply=False)
    src = source(campus, auth_header="Bearer s3cret")
    assert src.owner == campus.admin and src.auth_header == "Bearer s3cret"
    sources.save_source(campus.admin, src, name="Renamed", kind="timetable", url=src.url,
                        schedule="hourly", auto_apply=False)
    src.refresh_from_db()
    assert src.auth_header == "Bearer s3cret"  # left alone when not resent


def test_clean_scheduled_runs_apply_themselves(campus, room, monkeypatch):
    src = source(campus)
    serve(monkeypatch, "CS-301,3B,Thu,10:30,11:50,B-204")
    run = sources.run_source(src)
    assert run.status == "applied" and run.source == src
    assert ClassMeeting.objects.get().last_import == run
    assert src.last_success_at is not None and src.last_error == ""


def test_runs_with_problems_wait_for_a_person(campus, room, monkeypatch):
    src = source(campus)
    serve(monkeypatch, "CS-301,3B,Thu,10:30,11:50,B-204", "CS-301,9Z,Mon,09:00,10:00,B-204")
    run = sources.run_source(src)
    assert run.status == "preview" and "problems" in run.held_reason
    assert notes(campus.admin) == ["Sync needs review: Registrar timetable"]
    assert not ClassMeeting.objects.exists()

    manual = source(campus, name="Manual feed", auto_apply=False)
    serve(monkeypatch, "CS-301,3B,Thu,10:30,11:50,B-204")
    assert sources.run_now(campus.admin, manual).held_reason == "Automatic apply is off."


def test_failures_are_recorded_and_reported(campus, monkeypatch):
    src = source(campus)
    serve(monkeypatch, error=ValidationError("The source answered 503."))
    assert sources.run_source(src) is None
    src.refresh_from_db()
    assert src.last_error == "The source answered 503." and src.last_success_at is None
    assert notes(campus.admin) == ["Sync failed: Registrar timetable"]


def test_internal_addresses_are_refused(campus, settings, monkeypatch):
    settings.CAMPUSVERSE_SYNC_ALLOW_PRIVATE = False
    monkeypatch.setattr("socket.getaddrinfo", lambda host, port: [(2, 1, 6, "", ("10.0.0.5", 443))])
    with pytest.raises(ValidationError, match="internal address"):
        sources._check_host("https://intranet.example.edu/export.csv")
    monkeypatch.setattr("socket.getaddrinfo", lambda host, port: [(2, 1, 6, "", ("93.184.216.34",
                                                                                 443))])
    sources._check_host("https://registrar.example.edu/export.csv")  # public: fine


def test_due_sources_follow_their_schedule(campus):
    daily = source(campus)
    hourly = source(campus, name="Hourly", schedule="hourly")
    source(campus, name="By hand", schedule="manual")
    source(campus, name="Paused", is_active=False)
    now = timezone.now()
    assert {s.name for s in sources.due_sources(now)} == {daily.name, hourly.name}
    SyncSource.objects.update(last_attempt_at=now - timedelta(hours=2))
    assert {s.name for s in sources.due_sources(now)} == {"Hourly"}


def test_sync_api(client, campus, monkeypatch, room):
    client.force_login(campus.admin)
    made = client.post("/api/manage/sync-sources", {
        "name": "Registrar", "kind": "timetable", "url": "https://reg.example.edu/t.csv",
        "auth_header": "Bearer x"}, content_type="application/json")
    assert made.status_code == 201 and made.json()["has_auth"] is True
    assert "auth_header" not in made.json()
    serve(monkeypatch, "CS-301,3B,Thu,10:30,11:50,B-204")
    ran = client.post(f"/api/manage/sync-sources/{made.json()['id']}/run").json()
    assert (ran["source"], ran["held_reason"]) == ("Registrar", "Automatic apply is off.")
    template = client.get("/api/manage/imports/people/template.csv")
    assert template.content.startswith(b"email,first_name,last_name,kind")
    people = client.post("/api/manage/imports/people", {"file": csv(
        "p.csv", "email,first_name,last_name,kind", "z@test.edu,Zed,Q,staff")})
    assert people.status_code == 201 and people.json()["summary"]["new"] == 1
    client.force_login(campus.teacher)
    assert client.get("/api/manage/sync-sources").status_code == 403
    assert date.today()  # keeps the import used


class FakeResponse:
    def __init__(self, status, body, content_type="text/csv"):
        self.status_code, self._body = status, body
        self.headers = {"content-type": content_type}

    def iter_bytes(self):
        for i in range(0, len(self._body), 4096):
            yield self._body[i:i + 4096]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_fetch_limits_and_formats(campus, settings, monkeypatch):
    settings.CAMPUSVERSE_SYNC_ALLOW_PRIVATE = True
    src = source(campus, auth_header="Bearer s3cret")
    seen = {}

    def stream(method, url, headers, timeout, follow_redirects):
        seen.update(headers=headers, redirects=follow_redirects)
        return response

    monkeypatch.setattr("httpx.stream", stream)
    response = FakeResponse(200, b"course_code,section\n")
    upload = sources.fetch(src)
    assert upload.name == "timetable-sync.csv" and upload.read() == b"course_code,section\n"
    assert seen == {"headers": seen["headers"], "redirects": False}
    assert seen["headers"]["Authorization"] == "Bearer s3cret"

    response = FakeResponse(200, b"PK\x03\x04", "application/vnd.openxmlformats-"
                            "officedocument.spreadsheetml.sheet")
    assert sources.fetch(src).name == "timetable-sync.xlsx"
    response = FakeResponse(404, b"")
    with pytest.raises(ValidationError, match="answered 404"):
        sources.fetch(src)
    response = FakeResponse(200, b"x" * (sources.MAX_BYTES + 1))
    with pytest.raises(ValidationError, match="larger than 10 MB"):
        sources.fetch(src)


def test_runs_are_reachable_by_number_next_to_kind_uploads(client, campus):
    client.force_login(campus.admin)
    made = client.post("/api/manage/imports/people", {"file": csv(
        "p.csv", "email,first_name,last_name,kind", "z@test.edu,Zed,Q,staff")}).json()
    fetched = client.get(f"/api/manage/imports/{made['id']}")
    assert fetched.status_code == 200 and fetched.json()["kind"] == "people"
    assert client.post("/api/manage/imports/nonsense", {"file": csv("p.csv", "a")}) \
        .status_code == 404
