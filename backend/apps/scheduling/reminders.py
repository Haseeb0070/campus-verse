"""Reminders before each lecture: the teacher first, then the enrolled students.

Run every few minutes (the outside timer calls /api/cron/frequent). Each person gets one reminder
per lecture, whatever the timer does: the notification's dedupe key is the occurrence.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from apps.academic.models import Institution
from apps.enrollment.models import SectionEnrollment
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import ClassMeeting, LateNotice
from .services import expand, load_meetings

#: How long before a lecture each person is reminded.
TEACHER_LEAD = timedelta(minutes=15)
STUDENT_LEAD = timedelta(minutes=10)


def send_lecture_reminders(now: datetime | None = None) -> int:
    now = now or timezone.now()
    sent = 0
    for inst in Institution.objects.all():
        tz = ZoneInfo(inst.timezone)
        today = now.astimezone(tz).date()
        meetings = load_meetings(ClassMeeting.objects.filter(institution=inst))
        late = dict(((m, d), n) for m, d, n in LateNotice.objects.filter(
            institution=inst, date=today).values_list("meeting_id", "date", "minutes"))
        for occ in expand(meetings, today, today, tz):
            if not occ.is_happening:
                continue
            until = occ.starts_at - now
            if until <= timedelta(0) or until > TEACHER_LEAD:
                continue
            minutes = max(1, round(until.total_seconds() / 60))
            where = "online" if occ.mode == "online" else (f"in {occ.room}" if occ.room else "")
            what = f"{occ.course_title} ({occ.section_code}) starts in {minutes} min"
            body = f"{occ.starts_at.astimezone(tz):%H:%M}" + (f", {where}" if where else "")
            if occ.status == "room_changed":
                body += ". The room has changed."
            if late.get((occ.meeting_id, occ.date)):
                body += f". The teacher is running {late[(occ.meeting_id, occ.date)]} min late."
            key = f"reminder:{occ.meeting_id}:{occ.date.isoformat()}"
            sent += notify(occ.teacher_ids, kind=Notification.Kind.CLASS_REMINDER,
                           institution_id=inst.pk, title=f"Your lecture: {what}", body=body,
                           link="/today", dedupe_key=key)
            if until <= STUDENT_LEAD:
                students = SectionEnrollment.objects.filter(
                    section_id=occ.section_id, status=SectionEnrollment.Status.ACTIVE
                ).values_list("student_id", flat=True)
                sent += notify(list(students), kind=Notification.Kind.CLASS_REMINDER,
                               institution_id=inst.pk, title=what, body=body, link="/today",
                               dedupe_key=key)
    return sent
