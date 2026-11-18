import pytest
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction

from apps.enrollment.models import SectionEnrollment
from apps.feed import services
from apps.feed.models import Reaction, Visibility
from apps.governance.models import AuditLog
from apps.identity.models import RoleAssignment
from apps.notifications.models import Notification

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def quiet(monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


@pytest.fixture
def classmate(campus):
    """Hamza joins 3B too, so Ayesha has someone to talk to."""
    SectionEnrollment.objects.create(institution=campus.inst, section=campus.s3b,
                                     student=campus.hamza)
    return campus.hamza


def post_3b(campus, author=None, body="Anyone have notes from Thursday?", **kw):
    return services.create_post(author or campus.ayesha, body=body,
                                targets=[("section", campus.s3b.pk)], **kw)


def titles(user):
    return list(Notification.objects.filter(recipient=user).values_list("kind", "title"))


# Posting and seeing ---------------------------------------------------------------------------


def test_students_post_in_their_sections_only(campus):
    post = post_3b(campus)
    assert services.feed_for(campus.ayesha) == [post]
    assert services.feed_for(campus.hamza) == []  # 3C
    assert services.feed_for(campus.teacher) == [post]
    with pytest.raises(PermissionDenied):
        services.create_post(campus.ayesha, body="hi", targets=[("section", campus.s3c.pk)])
    with pytest.raises(PermissionDenied):  # no campus-wide posting for students
        services.create_post(campus.ayesha, body="hi", targets=[("institution", campus.inst.pk)])
    # Admins can.
    services.create_post(campus.admin, body="Welcome week!",
                         targets=[("institution", campus.inst.pk)])


def test_audiences_list_your_sections_and_wider_spaces_if_allowed(campus):
    assert [a["label"] for a in services.post_audiences(campus.ayesha)] == ["CS-301 · 3B"]
    admin = [a["key"] for a in services.post_audiences(campus.admin)]
    assert f"institution:{campus.inst.pk}" in admin and f"department:{campus.cs.pk}" in admin


def test_filter_by_space_and_search(campus):
    a = post_3b(campus, body="Lab 3 question about reverse()")
    b = services.create_post(campus.admin, body="Library hours",
                             targets=[("department", campus.cs.pk)])
    assert services.feed_for(campus.ayesha) == [b, a]
    assert services.feed_for(campus.ayesha, scope=("section", campus.s3b.pk)) == [a]
    assert services.feed_for(campus.ayesha, q="REVERSE") == [a]


def test_attachments_are_images_or_pdfs(campus):
    post = post_3b(campus, uploads=[SimpleUploadedFile("board.png", PNG)])
    assert post.attachments.count() == 1
    with pytest.raises(ValidationError, match="images or PDFs"):
        post_3b(campus, uploads=[SimpleUploadedFile("notes.py", b"print(1)")])
    with pytest.raises(ValidationError):
        post_3b(campus, body="", uploads=[])


def test_authors_delete_their_own_posts(campus, classmate):
    post = post_3b(campus)
    with pytest.raises(PermissionDenied):
        services.delete_post(classmate, post)
    services.delete_post(campus.ayesha, post)
    assert services.feed_for(classmate) == []


# Comments, reactions, notifications -----------------------------------------------------------


def test_comments_and_replies_notify_the_right_people(campus, classmate):
    post = post_3b(campus)
    top = services.add_comment(classmate, post, body="I have them, I'll share")
    reply = services.add_comment(campus.teacher, post, body="Slides are in Resources",
                                 parent_id=top.pk)
    # The fixture users have no names, so the email stands in for the name.
    assert sorted(t for _, t in titles(campus.ayesha)) == [
        "hamza@test.edu commented on your post",
        "imran@test.edu commented on your post",
    ]
    assert [t for _, t in titles(classmate)] == ["imran@test.edu replied to your comment"]
    assert titles(campus.teacher) == []  # never notified about your own reply
    with pytest.raises(ValidationError, match="reply to a comment"):
        services.add_comment(classmate, post, body="nested", parent_id=reply.pk)


def test_reactions_toggle_one_per_person(campus, classmate):
    post = post_3b(campus)
    assert services.toggle_reaction(classmate, post) is True
    assert services.toggle_reaction(campus.teacher, post) is True
    assert Reaction.objects.filter(post=post).count() == 2
    assert services.toggle_reaction(classmate, post) is False
    assert list(Reaction.objects.filter(post=post).values_list("user", flat=True)) == [
        campus.teacher.pk]
    with pytest.raises(IntegrityError), transaction.atomic():
        Reaction.objects.create(institution_id=post.institution_id, post=post, user=campus.teacher)


# Reports and moderation ----------------------------------------------------------------------


def test_report_once_and_not_your_own(campus, classmate):
    post = post_3b(campus)
    services.report(classmate, post, reason="spam")
    with pytest.raises(ValidationError, match="already reported"):
        services.report(classmate, post, reason="spam")
    with pytest.raises(ValidationError, match="your own"):
        services.report(campus.ayesha, post, reason="spam")


def test_section_teacher_moderates_and_the_author_is_told(campus, classmate):
    post = post_3b(campus, body="Selling exam answers, DM me")
    services.report(classmate, post, reason="inappropriate", details="Cheating")
    [r] = services.open_reports_for(campus.teacher)
    assert services.open_reports_for(classmate) == []

    services.moderate(campus.teacher, post, action="hide", note="Academic integrity", report=r)
    post.refresh_from_db()
    assert post.visibility == Visibility.HIDDEN
    assert services.feed_for(classmate) == []
    assert services.feed_for(campus.ayesha) == [post]  # the author still sees it, hidden
    assert services.feed_for(campus.teacher) == [post]  # so the moderator can restore it
    assert services.open_reports_for(campus.teacher) == []
    assert (Notification.Kind.MODERATION, "Your post was hidden by a moderator") in titles(
        campus.ayesha)
    assert AuditLog.objects.filter(action="moderation.hide", actor=campus.teacher).exists()

    services.moderate(campus.teacher, post, action="restore")
    assert services.feed_for(classmate) == [post]


def test_removed_content_is_gone_for_everyone_but_the_record(client, campus, classmate):
    post = post_3b(campus)
    services.moderate(campus.admin, post, action="remove", note="Spam")
    assert services.feed_for(campus.teacher) == []
    client.force_login(campus.ayesha)
    [mine] = client.get("/api/feed/posts").json()
    assert (mine["visibility"], mine["body"]) == ("removed", "")


def test_only_moderators_moderate(campus, classmate):
    post = post_3b(campus)
    with pytest.raises(PermissionDenied):
        services.moderate(classmate, post, action="hide")
    # A teacher can't moderate a campus-wide post just because they teach somewhere.
    wide = services.create_post(campus.admin, body="Campus news",
                                targets=[("institution", campus.inst.pk)])
    with pytest.raises(PermissionDenied):
        services.moderate(campus.teacher, wide, action="hide")
    RoleAssignment.objects.create(institution=campus.inst, user=campus.teacher,
                                  role=RoleAssignment.Role.MODERATOR)
    services.moderate(campus.teacher, wide, action="hide")


def test_dismiss_closes_only_that_report(campus, classmate):
    post = post_3b(campus)
    r = services.report(classmate, post, reason="off_topic")
    services.moderate(campus.teacher, post, action="dismiss", report=r)
    r.refresh_from_db()
    assert (r.status, r.resolution) == ("dismissed", "dismiss")
    post.refresh_from_db()
    assert post.visibility == Visibility.VISIBLE


# API -----------------------------------------------------------------------------------------


def test_feed_api_round_trip(client, campus, classmate):
    client.force_login(campus.ayesha)
    target = f"section:{campus.s3b.pk}"
    created = client.post("/api/feed/posts", {"body": "Whiteboard from today", "targets": [target],
                                              "files": [SimpleUploadedFile("board.png", PNG)]})
    assert created.status_code == 201
    post = created.json()
    assert (post["audiences"], post["mine"]) == (["CS-301 · 3B"], True)
    image = post["attachments"][0]["id"]
    shown = client.get(f"/api/feed/files/{image}")
    assert shown.status_code == 200 and shown["Content-Disposition"].startswith("inline")

    client.force_login(classmate)
    assert client.post(f"/api/feed/posts/{post['id']}/reactions").json() == {"on": True}
    assert client.post(f"/api/feed/posts/{post['id']}/comments", {"body": "Thanks!"},
                       content_type="application/json").status_code == 201
    [seen] = client.get("/api/feed/posts").json()
    assert (seen["reaction_count"], seen["reacted"], seen["comment_count"]) == (1, True, 1)
    assert client.post("/api/feed/reports", {"target_type": "post", "target_id": post["id"],
                                             "reason": "spam"},
                       content_type="application/json").status_code == 201

    client.force_login(campus.outsider)
    assert client.get(f"/api/feed/files/{image}").status_code == 404
    assert client.get(f"/api/feed/posts/{post['id']}/comments").status_code == 404

    client.force_login(campus.teacher)
    assert client.get("/api/feed/moderation/summary").json() == {"can_moderate": True, "open": 1}
    [queued] = client.get("/api/feed/moderation/reports").json()
    assert client.post(f"/api/feed/moderation/reports/{queued['id']}/resolve",
                       {"action": "hide", "note": "Off topic"},
                       content_type="application/json").status_code == 204
