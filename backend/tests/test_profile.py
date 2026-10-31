import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.governance.models import AuditLog
from apps.identity import profile
from apps.identity.models import CorrectionRequest
from apps.notifications.models import Notification


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


def test_preferred_name_replaces_the_first_name_everywhere(campus):
    campus.ayesha.first_name, campus.ayesha.last_name = "Ayesha", "Khan"
    campus.ayesha.save()
    profile.update_profile(campus.ayesha, preferred_name="  Ash  ")
    campus.ayesha.refresh_from_db()
    assert campus.ayesha.preferred_name == "Ash"
    assert campus.ayesha.get_full_name() == "Ash Khan"
    assert AuditLog.objects.filter(action="profile.updated").count() == 1
    profile.update_profile(campus.ayesha, preferred_name="Ash")  # no change, no log
    assert AuditLog.objects.filter(action="profile.updated").count() == 1
    with pytest.raises(ValidationError):
        profile.update_profile(campus.ayesha, preferred_name="x" * 61)


def test_people_ask_admins_to_correct_their_records(campus):
    req = profile.request_correction(campus.ayesha, topic="enrollment",
                                     details="I moved to 3C last week.")
    with pytest.raises(ValidationError, match="Choose"):
        profile.request_correction(campus.ayesha, topic="grades", details="x")
    with pytest.raises(ValidationError, match="Say what"):
        profile.request_correction(campus.ayesha, topic="name", details="  ")

    with pytest.raises(PermissionDenied):
        profile.resolve_correction(campus.teacher, req, status="resolved")
    with pytest.raises(ValidationError, match="why"):
        profile.resolve_correction(campus.admin, req, status="declined")
    profile.resolve_correction(campus.admin, req, status="resolved", response="Moved you to 3C.")
    req.refresh_from_db()
    assert (req.status, req.resolved_by) == ("resolved", campus.admin)
    note = Notification.objects.get(recipient=campus.ayesha)
    assert (note.title, note.body) == ("Your correction was made", "Moved you to 3C.")
    with pytest.raises(ValidationError, match="already"):
        profile.resolve_correction(campus.admin, req, status="declined", response="no")
    assert AuditLog.objects.filter(action="correction.resolved").exists()


def test_open_requests_are_capped(campus):
    for _ in range(profile.MAX_OPEN):
        profile.request_correction(campus.ayesha, topic="other", details="Something")
    with pytest.raises(ValidationError, match="several open"):
        profile.request_correction(campus.ayesha, topic="other", details="One more")


def test_profile_and_corrections_through_the_api(client, campus):
    client.force_login(campus.ayesha)
    updated = client.patch("/api/me", {"preferred_name": "Ash"}, content_type="application/json")
    assert updated.status_code == 200 and updated.json()["preferred_name"] == "Ash"
    made = client.post("/api/me/corrections", {"topic": "name", "details": "Spelling: Aisha"},
                       content_type="application/json")
    assert made.status_code == 201 and made.json()["topic_label"] == "My name"
    assert [c["status"] for c in client.get("/api/me/corrections").json()] == ["open"]
    assert client.get("/api/manage/corrections").status_code == 403

    client.force_login(campus.admin)
    queue = client.get("/api/manage/corrections").json()
    assert [(q["person"]["email"], q["details"]) for q in queue] == [
        ("ayesha@test.edu", "Spelling: Aisha")]
    done = client.post(f"/api/manage/corrections/{queue[0]['id']}/resolve",
                       {"status": "declined", "response": "Your ID card says Ayesha."},
                       content_type="application/json")
    assert done.status_code == 200 and done.json()["status"] == "declined"
    assert client.get("/api/manage/corrections").json() == []

    client.force_login(campus.outsider)  # another institution can't touch it
    assert client.post(f"/api/manage/corrections/{queue[0]['id']}/resolve",
                       {"status": "resolved"}, content_type="application/json").status_code == 403
    assert CorrectionRequest.objects.get().status == "declined"
