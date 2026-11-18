"""CSV downloads: right people only, Excel-friendly, and no formulas smuggled in."""

from decimal import Decimal

from django.utils import timezone

from apps.assignments import services as assignments
from apps.core.exports import _safe


def text(response) -> str:
    return b"".join(response.streaming_content).decode("utf-8-sig") if response.streaming \
        else response.content.decode("utf-8-sig")


def test_cells_that_look_like_formulas_are_defused():
    assert _safe("=HYPERLINK(\"x\")") == "'=HYPERLINK(\"x\")"
    assert _safe("@cmd") == "'@cmd"
    assert _safe("-12.5") == "-12.5"  # a plain negative number stays a number
    assert _safe(7) == "7" and _safe(None) == "" and _safe(True) == "Yes"


def test_teachers_download_class_lists_and_marks(client, campus):
    now = timezone.now()
    a = assignments.create_assignment(
        campus.teacher, section=campus.s3b, title="Lab 1",
        available_from=now - timezone.timedelta(days=1), due_at=now + timezone.timedelta(days=1),
    )
    assignments.record_grade(campus.teacher, a, campus.ayesha, points=Decimal("9"))

    client.force_login(campus.ayesha)
    assert client.get(f"/api/sections/{campus.s3b.pk}/roster.csv").status_code == 404
    assert client.get(f"/api/assignments/{a.pk}/grades.csv").status_code == 404

    client.force_login(campus.teacher)
    roster = client.get(f"/api/sections/{campus.s3b.pk}/roster.csv")
    assert roster["Content-Type"].startswith("text/csv")
    assert roster.content.startswith("﻿".encode())  # Excel reads it as UTF-8
    assert campus.ayesha.email in text(roster)

    marks = text(client.get(f"/api/sections/{campus.s3b.pk}/marks.csv"))
    assert "Lab 1 (/10)" in marks.splitlines()[0]
    assert any(campus.ayesha.email in line and ",9" in line for line in marks.splitlines())

    grades = text(client.get(f"/api/assignments/{a.pk}/grades.csv"))
    assert "Not handed in" in grades


def test_admins_download_people_and_reports(client, campus):
    client.force_login(campus.teacher)
    assert client.get("/api/manage/people.csv").status_code == 403
    client.force_login(campus.admin)
    people = text(client.get("/api/manage/people.csv"))
    assert people.splitlines()[0].startswith("College ID,First name")
    assert campus.hamza.email in people
    report = text(client.get("/api/manage/reports.csv?days=30"))
    assert report.splitlines()[1].startswith("Period,Last 30 days")
