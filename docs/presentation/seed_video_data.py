"""Sample coursework for the presentation screenshots. Run it ONLY against a copy of the local
database (see README.md): it writes rows directly, so nobody is notified.

    DATABASE_URL=sqlite:///<copy>.sqlite3 PUSH_ENABLED=false EMAIL_URL=consolemail:// \
        uv run python manage.py shell < ../docs/presentation/seed_video_data.py
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings

assert "video" in str(settings.DATABASES["default"]["NAME"]), "Run this on the video copy only."

from apps.academic.models import Section
from apps.assignments.models import Assignment, Grade, Submission
from apps.attendance.models import AttendanceRecord, AttendanceSession
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.identity.models import User
from apps.notifications.models import Notification
from apps.scheduling.models import ClassMeeting, Room, ScheduleChange

PK = ZoneInfo("Asia/Karachi")
TODAY = date(2026, 11, 25)  # the Wednesday the screenshots were taken
me = User.objects.get(email="126139@gcslahore.edu.pk")
inst = me.institution

# The local test teacher is not a real member of staff.
TeacherAssignment.objects.filter(teacher__email="mobile-test@gcslahore.edu.pk").delete()
Notification.objects.filter(title__icontains="TEST").delete()


def section(code):
    return Section.objects.get(offering__course__code=code)


def teacher(sec):
    return TeacherAssignment.objects.filter(section=sec).first().teacher


def at(d, h, m=0):
    return datetime.combine(d, time(h, m), PK)


# Friday's Web Development class moves to the other room.
web_fri = ClassMeeting.objects.get(section=section("EC-330"), weekday=4)
ScheduleChange.objects.get_or_create(
    institution=inst, meeting=web_fri, date=TODAY + timedelta(days=2),
    defaults=dict(status="room_changed", new_room=Room.objects.get(code="R-27"),
                  note="R-127 is booked for a seminar", created_by=teacher(web_fri.section)),
)

# One piece of work to hand in, and three that are marked and released.
WORK = [
    ("EC-330", "Project proposal", "Send a one-page proposal for your Web Development project: "
     "the idea, your three group members and the pages you will build.", 2, 10, None),
    ("CC-310", "Lab 2: Search algorithms", "Implement breadth-first and depth-first search.", -5, 20, "18"),
    ("CC-313", "Problem set 3", "Questions 1 to 6 on divide and conquer.", -7, 10, "8.5"),
    ("DC-322", "Quiz 2: Pipelining", "Chapters 3 and 4.", -6, 15, "13"),
]
for code, title, text, due_in, points, mark in WORK:
    sec = section(code)
    t = teacher(sec)
    a, _ = Assignment.objects.get_or_create(
        institution=inst, section=sec, title=title,
        defaults=dict(instructions=text, available_from=at(TODAY + timedelta(days=due_in - 7), 9),
                      due_at=at(TODAY + timedelta(days=due_in), 23, 59), submission_type="file",
                      max_points=points, created_by=t,
                      grades_released_at=at(TODAY + timedelta(days=due_in + 2), 10) if mark else None),
    )
    if mark:
        Submission.objects.get_or_create(institution=inst, assignment=a, student=me, attempt=1,
                                         defaults=dict(text="Submitted in class."))
        Grade.objects.get_or_create(institution=inst, assignment=a, student=me,
                                    defaults=dict(points=Decimal(mark), graded_by=t))

# Attendance for the three weeks before the screenshots: everyone present, with a late and an
# absence for the student whose screens are shown.
MINE = {("CC-320", date(2026, 11, 17)): "absent", ("EC-330", date(2026, 11, 13)): "late"}
day = date(2026, 11, 2)
while day <= TODAY:
    for m in ClassMeeting.objects.filter(weekday=day.weekday()).select_related("section__offering__course"):
        sec = m.section
        s, made = AttendanceSession.objects.get_or_create(
            institution=inst, section=sec, date=day, meeting=m, defaults=dict(taken_by=teacher(sec)))
        if not made:
            continue
        code = sec.offering.course.code
        AttendanceRecord.objects.bulk_create(
            AttendanceRecord(institution=inst, session=s, student_id=sid,
                             status=MINE.get((code, day), "present") if sid == me.pk else "present")
            for sid in SectionEnrollment.objects.filter(section=sec, status="active").values_list("student_id", flat=True))
    day += timedelta(days=1)

print("ok", Assignment.objects.count(), AttendanceSession.objects.count(), AttendanceRecord.objects.count())
