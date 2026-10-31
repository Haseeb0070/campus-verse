import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.core.audience import can_target, can_view, context_keys
from apps.enrollment.models import SectionEnrollment
from apps.notices.models import Notice
from apps.notices.services import publish_notice


def draft(title="Quiz moved"):
    return Notice(title=title, body="Thursday, 10:30 AM")


def visible_titles(user):
    return set(Notice.objects.published().visible_to(user).values_list("title", flat=True))


def test_context_comes_from_enrollment(campus):
    keys = context_keys(campus.ayesha)
    assert ("section", campus.s3b.pk) in keys
    assert ("department", campus.cs.pk) in keys
    assert ("section", campus.s3c.pk) not in keys


def test_section_notice_reaches_only_that_section(campus):
    publish_notice(author=campus.teacher, notice=draft(), targets=[("section", campus.s3b.pk)])
    assert visible_titles(campus.ayesha) == {"Quiz moved"}
    assert visible_titles(campus.hamza) == set()
    assert visible_titles(campus.outsider) == set()


def test_department_notice_reaches_every_section(campus):
    publish_notice(
        author=campus.admin, notice=draft("Mid-terms"), targets=[("department", campus.cs.pk)]
    )
    assert "Mid-terms" in visible_titles(campus.ayesha)
    assert "Mid-terms" in visible_titles(campus.hamza)


def test_drafts_stay_hidden(campus):
    notice = draft()
    notice.author = campus.teacher
    notice.institution = campus.inst
    notice.save()
    assert visible_titles(campus.ayesha) == set()


def test_teacher_cannot_post_to_a_section_they_dont_teach(campus):
    assert can_target(campus.teacher, "section", campus.s3b.pk)
    assert not can_target(campus.teacher, "section", campus.s3c.pk)
    assert not can_target(campus.teacher, "offering", campus.offering.pk)
    with pytest.raises(PermissionDenied):
        publish_notice(author=campus.teacher, notice=draft(), targets=[("section", campus.s3c.pk)])


def test_students_cannot_post_and_outsiders_cannot_reach_in(campus):
    assert not can_target(campus.ayesha, "section", campus.s3b.pk)
    assert not can_target(campus.outsider, "institution", campus.inst.pk)


def test_notice_needs_an_audience(campus):
    with pytest.raises(ValidationError):
        publish_notice(author=campus.admin, notice=draft(), targets=[])


def test_dropping_a_section_removes_access(campus):
    notice = publish_notice(
        author=campus.teacher, notice=draft(), targets=[("section", campus.s3b.pk)]
    )
    assert can_view(campus.ayesha, notice)
    enrollment = SectionEnrollment.objects.get(student=campus.ayesha, section=campus.s3b)
    enrollment.status = SectionEnrollment.Status.DROPPED
    enrollment.save()
    assert not can_view(campus.ayesha, notice)
