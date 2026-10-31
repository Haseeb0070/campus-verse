from datetime import timedelta

import pytest
from django.utils import timezone

from apps.academic.models import Course, CourseOffering, Section
from apps.assignments.models import Assignment
from apps.events.services import create_event
from apps.feed.models import Visibility
from apps.feed.services import create_post
from apps.notices.models import Notice
from apps.notices.services import publish_notice, save_draft
from apps.resources.services import create_resource
from apps.search import services


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


@pytest.fixture
def content(campus):
    """The same word, "graphs", in every kind of content, all shared with 3B only."""
    to_3b = [("section", campus.s3b.pk)]
    now = timezone.now()
    return {
        "notice": publish_notice(author=campus.teacher, targets=to_3b, notify=False,
                                 notice=Notice(title="Graphs quiz moved", body="Now on Monday.")),
        "draft": save_draft(author=campus.teacher, targets=to_3b,
                            notice=Notice(title="Graphs draft", body="Not out yet.")),
        "resource": create_resource(campus.teacher, offering=campus.offering, targets=to_3b,
                                    title="Graphs reading", kind="reading",
                                    url="https://example.com/graphs"),
        "post": create_post(campus.ayesha, body="Who wants to revise graphs together?",
                            targets=to_3b),
        "event": create_event(campus.teacher, targets=to_3b, title="Graphs workshop",
                              starts_at=now + timedelta(days=2), ends_at=now + timedelta(days=2,
                                                                                          hours=1),
                              location="Lab 2"),
        "assignment": Assignment.objects.create(
            institution=campus.inst, section=campus.s3b, title="Graphs lab",
            created_by=campus.teacher, available_from=now - timedelta(days=1),
            due_at=now + timedelta(days=3)),
    }


def titles(user, q="graphs", **kw):
    found = services.search(user, q, **kw)["results"]
    return {kind: [hit["title"] for hit in hits] for kind, hits in found.items() if hits}


def test_people_find_what_they_can_open_and_nothing_else(campus, content):
    assert titles(campus.ayesha) == {
        "notices": ["Graphs quiz moved"], "resources": ["Graphs reading"],
        "posts": ["ayesha@test.edu posted"], "events": ["Graphs workshop"],
        "assignments": ["Graphs lab"],
    }
    assert titles(campus.hamza) == {}  # 3C: not even a hint that these exist
    assert titles(campus.outsider) == {}
    assert "Graphs draft" not in str(titles(campus.ayesha))  # drafts stay with their author


def test_hidden_or_expired_things_drop_out(campus, content):
    content["post"].visibility = Visibility.REMOVED
    content["post"].save()
    Notice.objects.filter(pk=content["notice"].pk).update(
        expires_at=timezone.now() - timedelta(minutes=1))
    found = titles(campus.ayesha)
    assert "posts" not in found and "notices" not in found


def test_courses_words_and_filters(campus, content):
    assert titles(campus.ayesha, "data struct")["courses"] == ["CS-301 · Data Structures"]
    # Every word must appear, in any searched field: the workshop is in "Lab 2".
    assert titles(campus.ayesha, "graphs lab") == {"events": ["Graphs workshop"],
                                                   "assignments": ["Graphs lab"]}
    assert titles(campus.ayesha, "graphs quiz") == {"notices": ["Graphs quiz moved"]}
    assert services.search(campus.ayesha, "g")["total"] == 0  # too short to search

    other = Course.objects.create(institution=campus.inst, department=campus.cs, code="CS-110",
                                  title="Programming")
    offering = CourseOffering.objects.create(institution=campus.inst, course=other,
                                             term=campus.offering.term)
    Section.objects.create(institution=campus.inst, offering=offering, code="1A")
    course = campus.offering.course
    assert titles(campus.ayesha, course_id=other.pk) == {}
    assert len(titles(campus.ayesha, course_id=course.pk)) == 5
    assert titles(campus.ayesha, types=("events",)) == {"events": ["Graphs workshop"]}


def test_snippets_centre_on_the_match():
    text = "A" * 300 + " the graphs part " + "B" * 300
    s = services.snippet(text, "graphs")
    assert "graphs" in s and s.startswith("…") and s.endswith("…") and len(s) <= 162


def test_search_api(client, campus, content):
    client.force_login(campus.ayesha)
    found = client.get("/api/search", {"q": "graphs", "type": "resources"}).json()
    assert found["total"] == 1 and found["results"]["resources"][0]["link"].startswith(
        "/resources/")
    assert [c["code"] for c in client.get("/api/search/courses").json()] == ["CS-301"]
    client.force_login(campus.hamza)
    assert client.get("/api/search", {"q": "graphs"}).json()["total"] == 0
