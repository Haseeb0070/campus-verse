import re
from datetime import time

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.administration import imports
from apps.administration.models import ImportRun
from apps.governance.models import AuditLog
from apps.identity.models import RoleAssignment, User
from apps.scheduling.models import ClassMeeting, Room


@pytest.fixture(autouse=True)
def private_media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def actions():
    return list(AuditLog.objects.values_list("action", flat=True))


# Access --------------------------------------------------------------------------------------


@pytest.mark.parametrize("who", ["teacher", "ayesha", "outsider"])
def test_manage_api_is_admin_only(client, campus, who):
    client.force_login(getattr(campus, who))
    for url in ("/api/manage/overview", "/api/manage/people", "/api/manage/imports",
                "/api/manage/audit"):
        assert client.get(url).status_code == 403


def test_overview_counts(client, campus):
    client.force_login(campus.admin)
    data = client.get("/api/manage/overview").json()
    # Test University: Ayesha + Hamza students, Imran teacher, Nadia staff.
    assert (data["students"], data["teachers"], data["staff"], data["sections"]) == (2, 1, 1, 2)


# People --------------------------------------------------------------------------------------


def test_invite_creates_account_and_emails_a_working_link(
    client, campus, django_capture_on_commit_callbacks
):
    client.force_login(campus.admin)
    with django_capture_on_commit_callbacks(execute=True):
        res = client.post("/api/manage/people", {"email": "Zain@Test.edu", "first_name": "Zain",
                                                 "last_name": "Raza", "kind": "student"},
                          content_type="application/json")
    assert res.status_code == 201
    zain = User.objects.get(email="zain@test.edu")
    assert (zain.institution, zain.has_usable_password(), res.json()["invited"]) == (
        campus.inst, False, True
    )
    assert not zain.roles.exists()  # being invited never grants a role

    [message] = mail.outbox
    assert message.to == ["zain@test.edu"]
    key = re.search(r"/account/password/reset/(\S+)", message.body).group(1)

    client.logout()
    check = client.get("/_allauth/browser/v1/auth/password/reset",
                       HTTP_X_PASSWORD_RESET_KEY=key)
    assert check.status_code == 200
    client.get("/api/csrf")
    done = client.post("/_allauth/browser/v1/auth/password/reset",
                       {"key": key, "password": "a-strong-passphrase-42"},
                       content_type="application/json",
                       HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
    assert done.status_code == 200  # signed straight in (ACCOUNT_LOGIN_ON_PASSWORD_RESET)
    zain.refresh_from_db()
    assert zain.check_password("a-strong-passphrase-42")
    assert client.get("/api/me").json()["email"] == "zain@test.edu"
    # The link works once.
    assert client.get("/_allauth/browser/v1/auth/password/reset",
                      HTTP_X_PASSWORD_RESET_KEY=key).status_code == 400
    assert "person.invited" in actions()


def test_invite_validation(client, campus):
    client.force_login(campus.admin)
    dup = client.post("/api/manage/people", {"email": "ayesha@test.edu", "first_name": "A"},
                      content_type="application/json")
    assert (dup.status_code, dup.json()["detail"]) == (
        422, "Someone with that email already has an account."
    )
    bad = client.post("/api/manage/people", {"email": "nope", "first_name": "A"},
                      content_type="application/json")
    assert bad.json()["detail"] == "Enter a valid email address."


def test_deactivating_signs_someone_out(client, campus):
    client.force_login(campus.admin)
    assert client.post(f"/api/manage/people/{campus.ayesha.pk}/deactivate").status_code == 200
    me = client.post(f"/api/manage/people/{campus.admin.pk}/deactivate")
    assert (me.status_code, me.json()["detail"]) == (422, "You can't deactivate your own account.")

    client.force_login(campus.ayesha)  # an old session for her
    campus.ayesha.refresh_from_db()
    assert not campus.ayesha.is_active
    assert client.get("/api/me").status_code == 401
    assert "person.deactivated" in actions()


def test_roles_are_granted_and_revoked_with_guards(client, campus):
    client.force_login(campus.admin)
    url = f"/api/manage/people/{campus.teacher.pk}/roles"
    no_dept = client.post(url, {"role": "department_coordinator"},
                          content_type="application/json")
    assert no_dept.json()["detail"] == "Choose the department they coordinate."
    ok = client.post(url, {"role": "department_coordinator", "department_id": campus.cs.pk},
                     content_type="application/json")
    assert ok.json()["roles"] == [{"id": ok.json()["roles"][0]["id"],
                                   "role": "department_coordinator",
                                   "department": "Computer Science"}]
    # The new coordinator can now post to the whole department.
    from apps.core.audience import can_target
    assert can_target(campus.teacher, "department", campus.cs.pk)

    own_admin = RoleAssignment.objects.get(user=campus.admin)
    assert client.delete(f"/api/manage/roles/{own_admin.pk}").status_code == 422
    assert client.delete(f"/api/manage/roles/{ok.json()['roles'][0]['id']}").status_code == 204
    assert {"role.granted", "role.revoked"} <= set(actions())


# Timetable import ----------------------------------------------------------------------------


@pytest.fixture
def rooms(campus):
    return {c: Room.objects.create(institution=campus.inst, code=c) for c in ("B-204", "B-210")}


def csv_file(*lines):
    body = "course_code,section,day,start,end,room,kind,mode\n" + "\n".join(lines) + "\n"
    return SimpleUploadedFile("timetable.csv", body.encode())


def test_preview_classifies_every_row_and_changes_nothing(campus, rooms):
    ClassMeeting.objects.create(institution=campus.inst, section=campus.s3b, weekday=3,
                                starts_at=time(10, 30), ends_at=time(11, 50), room=rooms["B-204"])
    ClassMeeting.objects.create(institution=campus.inst, section=campus.s3c, weekday=0,
                                starts_at=time(9, 0), ends_at=time(10, 20), room=rooms["B-204"])
    run = imports.preview(campus.admin, csv_file(
        "CS-301,3B,Thu,10:30,11:50,B-210,lecture,in_person",   # update: room
        "CS-301,3C,Tue,14:30,15:50,B-204,lab,",                # new
        "CS-301,3C,Tue,15:00,16:00,B-204,,",                   # new, clashes with the row above
        "CS-301,9Z,Mon,09:00,10:00,B-204,,",                   # error: no such section
        "CS-301,3B,Wed,25:00,26:00,B-204,,",                   # error: bad time
        "CS-301,3B,Fri,09:00,10:00,Z-999,,",                   # error: unknown room
        "CS-301,3B,Thu,10:30,11:50,B-210,,",                   # error: duplicate of line 2
        "CS-301,3B,Sat,11:00,12:00,Online,,",                  # new, online
    ))
    rows = run.plan["rows"]
    assert [r["status"] for r in rows] == [
        "update", "new", "new", "error", "error", "error", "error", "new"
    ]
    assert rows[0]["changes"] == {"room": ["B-204", "B-210"]}
    assert "no section CS-301 · 9Z" in rows[3]["message"]
    assert "Same class as line 2" in rows[6]["message"]
    assert rows[1]["clash"] and rows[2]["clash"]
    assert rows[7]["mode"] == "online"
    # Monday 3C wasn't in the file: reported, not deleted.
    assert run.plan["summary"]["not_in_file"] == 1
    assert ClassMeeting.objects.count() == 2


def test_apply_writes_only_valid_rows_and_is_audited(campus, rooms):
    run = imports.preview(campus.admin, csv_file(
        "CS-301,3B,Thu,10:30,11:50,B-204,,", "CS-301,9Z,Mon,09:00,10:00,B-204,,",
    ))
    imports.apply(campus.admin, run)
    run.refresh_from_db()
    assert (run.status, run.result) == ("applied", {"created": 1, "updated": 0, "skipped": 1})
    assert ClassMeeting.objects.count() == 1
    with pytest.raises(Exception, match="already applied"):
        imports.apply(campus.admin, run)

    # Importing the same file again changes nothing.
    again = imports.preview(campus.admin, csv_file("CS-301,3B,Thu,10:30,11:50,B-204,,"))
    assert again.plan["summary"]["unchanged"] == 1
    assert {"import.previewed", "import.applied"} <= set(actions())


def test_apply_refuses_a_stale_preview(campus, rooms):
    run = imports.preview(campus.admin, csv_file("CS-301,3B,Thu,10:30,11:50,B-204,,"))
    ClassMeeting.objects.create(institution=campus.inst, section=campus.s3b, weekday=3,
                                starts_at=time(10, 30), ends_at=time(11, 50), room=rooms["B-204"])
    with pytest.raises(Exception, match="changed since this preview"):
        imports.apply(campus.admin, run)
    assert ClassMeeting.objects.count() == 1


def test_import_api_and_bad_files(client, campus, rooms):
    client.force_login(campus.admin)
    res = client.post("/api/manage/imports/timetable",
                      {"file": csv_file("CS-301,3B,Thu,10:30,11:50,B-204,,")})
    assert res.status_code == 201
    run_id = res.json()["id"]
    assert client.post(f"/api/manage/imports/{run_id}/apply").json()["status"] == "applied"

    no_cols = SimpleUploadedFile("t.csv", b"course,when\nCS-301,Thu\n")
    bad = client.post("/api/manage/imports/timetable", {"file": no_cols})
    assert bad.status_code == 422 and "missing these columns" in bad.json()["detail"]
    assert ImportRun.objects.count() == 1

    client.force_login(campus.teacher)
    assert client.post("/api/manage/imports/timetable",
                       {"file": csv_file("CS-301,3B,Thu,10:30,11:50,B-204,,")}).status_code == 403


def test_audit_log_filters(client, campus):
    client.force_login(campus.admin)
    client.post(f"/api/manage/people/{campus.ayesha.pk}/deactivate")
    entries = client.get("/api/manage/audit", {"action": "person."}).json()
    found = [(e["action"], e["actor"]) for e in entries]
    assert found == [("person.deactivated", "nadia@test.edu")]
