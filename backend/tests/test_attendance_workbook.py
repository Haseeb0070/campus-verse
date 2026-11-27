"""Attendance as an Excel workbook, and who may download it."""

import io
from datetime import time

import pytest
from openpyxl import load_workbook

from apps.attendance import services
from apps.scheduling.models import ClassMeeting


@pytest.fixture
def enabled(campus):
    campus.inst.attendance_enabled = True
    campus.inst.save()
    campus.ayesha.college_roll = "503"
    campus.ayesha.external_id = "126143"
    campus.ayesha.save()
    return campus


def test_a_subjects_day_downloads_as_an_excel_register(client, enabled):
    from django.utils import timezone

    today = timezone.localdate()
    meeting = ClassMeeting.objects.create(institution=enabled.inst, section=enabled.s3b,
                                          weekday=today.weekday(), starts_at=time(8, 30),
                                          ends_at=time(9, 30))
    services.save(enabled.teacher, enabled.s3b, today, meeting.pk,
                  {enabled.ayesha.pk: ("present", "")})
    client.force_login(enabled.teacher)
    r = client.get(f"/api/attendance/sections/{enabled.s3b.pk}/day.xlsx?day={today}")
    assert r.status_code == 200
    assert r["Content-Type"].startswith("application/vnd.openxmlformats")
    wb = load_workbook(io.BytesIO(r.content))
    ws = wb.worksheets[0]
    values = [c.value for row in ws.iter_rows() for c in row if c.value is not None]
    assert "503" in values and "126143" in values and "Present" in values
    assert any(str(v).startswith("Taken by") for v in values)

    client.force_login(enabled.ayesha)  # a student who isn't CR/GR
    r = client.get(f"/api/attendance/sections/{enabled.s3b.pk}/day.xlsx?day={today}")
    assert r.status_code == 403
    r = client.get(f"/api/attendance/sections/{enabled.s3b.pk}/class-day.xlsx?day={today}")
    assert r.status_code == 403
    client.force_login(enabled.admin)
    r = client.get(f"/api/attendance/sections/{enabled.s3b.pk}/class-day.xlsx?day={today}")
    assert r.status_code == 200
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames[0] == "Summary" and len(wb.sheetnames) == 2
