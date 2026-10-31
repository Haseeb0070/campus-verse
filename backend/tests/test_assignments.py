from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.assignments import services
from apps.assignments.models import Assignment
from apps.core.files import check_upload
from apps.governance.models import AuditLog

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


@pytest.fixture(autouse=True)
def private_media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def pdf(name="answer.pdf", body=PDF):
    return SimpleUploadedFile(name, body, content_type="application/pdf")


def make(campus, *, due_in=timedelta(days=2), opened_ago=timedelta(days=1), **kw):
    now = timezone.now()
    defaults = {"title": "Linked list lab", "available_from": now - opened_ago,
                "due_at": now + due_in}
    return services.create_assignment(campus.teacher, section=campus.s3b, **(defaults | kw))


# Files ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "body", "error"),
    [
        ("virus.exe", b"MZ\x90\x00", "isn't allowed"),
        ("fake.pdf", b"MZ\x90\x00 not a pdf", "doesn't look like a real .pdf"),
        ("notes.txt", b"\x00\x01\x02binary", "doesn't look like a real .txt"),
        ("empty.pdf", b"", "is empty"),
    ],
)
def test_uploads_are_checked_by_content_not_name(name, body, error):
    with pytest.raises(ValidationError, match=error):
        check_upload(SimpleUploadedFile(name, body, content_type="application/pdf"))


def test_good_uploads_pass_and_size_is_limited(settings):
    assert check_upload(pdf())[1] == "application/pdf"
    assert check_upload(SimpleUploadedFile("main.py", "print('سلام')".encode()))[0] == ".py"
    settings.CAMPUSVERSE_MAX_UPLOAD_MB = 0
    with pytest.raises(ValidationError, match="larger than"):
        check_upload(pdf())


# Creating and seeing work --------------------------------------------------------------------


def test_only_teachers_of_the_section_set_work(campus):
    make(campus)
    with pytest.raises(PermissionDenied):
        services.create_assignment(
            campus.teacher, section=campus.s3c, title="x",
            available_from=timezone.now(), due_at=timezone.now() + timedelta(days=1),
        )
    with pytest.raises(ValidationError, match="after it opens"):
        make(campus, due_in=-timedelta(days=2))


def test_students_see_only_open_published_work_in_their_sections(campus):
    open_one = make(campus)
    make(campus, title="Not open yet", opened_ago=-timedelta(days=1), due_in=timedelta(days=5))
    make(campus, title="Draft", status=Assignment.Status.DRAFT)
    assert list(services.visible_assignments(campus.ayesha)) == [open_one]
    assert list(services.visible_assignments(campus.hamza)) == []  # section 3C
    assert services.visible_assignments(campus.teacher).count() == 3


# Submitting ----------------------------------------------------------------------------------


def test_submission_records_time_lateness_and_attempts(campus):
    a = make(campus, max_attempts=2)
    first = services.submit(campus.ayesha, a, uploads=[pdf()])
    assert (first.attempt, first.is_late, first.files.count()) == (1, False, 1)
    second = services.submit(campus.ayesha, a, uploads=[pdf("v2.pdf")])
    assert second.attempt == 2
    with pytest.raises(ValidationError, match="used all your attempts"):
        services.submit(campus.ayesha, a, uploads=[pdf()])


def test_deadlines_and_late_policy(campus):
    closed = make(campus, title="Closed", opened_ago=timedelta(days=5), due_in=-timedelta(hours=1))
    with pytest.raises(ValidationError, match="deadline has passed"):
        services.submit(campus.ayesha, closed, uploads=[pdf()])

    late_ok = make(campus, title="Late ok", opened_ago=timedelta(days=5),
                   due_in=-timedelta(hours=1), allow_late=True,
                   late_until=timezone.now() + timedelta(days=1))
    assert services.submit(campus.ayesha, late_ok, uploads=[pdf()]).is_late


def test_submission_type_and_membership_rules(campus):
    files_only = make(campus)
    with pytest.raises(ValidationError, match="files only"):
        services.submit(campus.ayesha, files_only, text="my answer")
    text_only = make(campus, title="Essay", submission_type="text")
    with pytest.raises(ValidationError, match="written answer"):
        services.submit(campus.ayesha, text_only, uploads=[pdf()])
    assert services.submit(campus.ayesha, text_only, text="My essay").text == "My essay"

    with pytest.raises(PermissionDenied):
        services.submit(campus.teacher, files_only, uploads=[pdf()])
    with pytest.raises(PermissionDenied):
        services.submit(campus.hamza, files_only, uploads=[pdf()])


def test_one_bad_file_rejects_the_whole_submission(campus, tmp_path):
    a = make(campus)
    with pytest.raises(ValidationError):
        services.submit(campus.ayesha, a, uploads=[pdf(), pdf("bad.pdf", b"nope")])
    assert a.submissions.count() == 0
    assert not any(p.is_file() for p in tmp_path.rglob("*"))  # nothing written to disk


# Grading -------------------------------------------------------------------------------------


def test_grades_stay_hidden_until_released(client, campus):
    a = make(campus, max_points=20)
    services.submit(campus.ayesha, a, uploads=[pdf()])
    services.record_grade(campus.teacher, a, campus.ayesha, points=Decimal("17.5"),
                          feedback="Clean recursion")

    client.force_login(campus.ayesha)
    assert client.get(f"/api/assignments/{a.pk}").json()["my_grade"] is None
    services.release_grades(campus.teacher, a)
    assert client.get(f"/api/assignments/{a.pk}").json()["my_grade"] == {
        "points": "17.50", "feedback": "Clean recursion"
    }
    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {"grade.recorded", "grades.released"} <= actions


def test_grade_rules(campus):
    a = make(campus, max_points=10)
    with pytest.raises(ValidationError, match="between 0 and 10"):
        services.record_grade(campus.teacher, a, campus.ayesha, points=Decimal("11"))
    with pytest.raises(ValidationError, match="isn't in this section"):
        services.record_grade(campus.teacher, a, campus.hamza, points=Decimal("5"))
    with pytest.raises(PermissionDenied):
        services.record_grade(campus.ayesha, a, campus.ayesha, points=Decimal("10"))


# API and downloads ---------------------------------------------------------------------------


def test_full_flow_through_the_api(client, campus):
    client.force_login(campus.teacher)
    due = (timezone.now() + timedelta(days=3)).isoformat()
    created = client.post("/api/assignments", {"section_id": campus.s3b.pk, "title": "Lab 3",
                                               "due_at": due, "max_points": 10},
                          content_type="application/json")
    assert created.status_code == 201
    aid = created.json()["id"]
    brief = client.post(f"/api/assignments/{aid}/attachments", {"file": pdf("brief.pdf")})
    assert brief.status_code == 201

    client.force_login(campus.ayesha)
    detail = client.get(f"/api/assignments/{aid}").json()
    assert (detail["window"], detail["my_attempts"], detail["attachments"][0]["name"]) == (
        "open", 0, "brief.pdf"
    )
    sent = client.post(f"/api/assignments/{aid}/submissions", {"files": [pdf()]})
    assert sent.status_code == 201
    my_file = sent.json()["files"][0]["id"]
    assert client.get(f"/api/assignments/files/{my_file}").status_code == 200
    assert client.get(f"/api/assignments/{aid}/submissions").status_code == 403

    client.force_login(campus.teacher)
    rows = client.get(f"/api/assignments/{aid}/submissions").json()
    assert [(r["student"]["email"], r["attempts"]) for r in rows] == [("ayesha@test.edu", 1)]
    graded = client.put(f"/api/assignments/{aid}/grades/{campus.ayesha.pk}",
                        {"points": "9", "feedback": "Good"}, content_type="application/json")
    assert graded.status_code == 200
    download = client.get(f"/api/assignments/files/{my_file}")
    assert download.status_code == 200
    assert download["Content-Disposition"].startswith('attachment; filename="answer.pdf"')
    assert b"".join(download.streaming_content) == PDF


def test_files_are_private_to_the_people_involved(client, campus):
    a = make(campus)
    sub = services.submit(campus.ayesha, a, uploads=[pdf()])
    file_id = sub.files.first().pk
    for outsider in (campus.hamza, campus.outsider):
        client.force_login(outsider)
        assert client.get(f"/api/assignments/files/{file_id}").status_code == 404
    client.force_login(campus.hamza)
    assert client.get(f"/api/assignments/{a.pk}").status_code == 404


def test_rejected_upload_returns_a_clear_message(client, campus):
    a = make(campus)
    client.force_login(campus.ayesha)
    bad = client.post(f"/api/assignments/{a.pk}/submissions",
                      {"files": [SimpleUploadedFile("tool.exe", b"MZ")]})
    assert (bad.status_code, bad.json()["detail"]) == (
        422, "tool.exe: that file type isn't allowed."
    )


def test_seed_demo_runs_on_a_fresh_database(db, settings):
    from io import StringIO

    from django.core.management import call_command

    settings.DEBUG = True
    call_command("seed_demo", stdout=StringIO())
    assert Assignment.objects.count() == 3
