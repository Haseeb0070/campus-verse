from datetime import time, timedelta

from allauth.account.models import EmailAddress
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.academic.models import (
    AcademicTerm,
    Course,
    CourseOffering,
    Department,
    Institution,
    Program,
    Section,
)
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.identity.models import RoleAssignment, User
from apps.notices.models import Notice
from apps.notices.services import publish_notice
from apps.scheduling.models import ClassMeeting, Room, ScheduleChange

DEMO_PASSWORD = "campusverse-demo"  # local demo accounts only; see README
DOMAIN = "demo.campusverse.test"

MON, TUE, WED, THU, FRI = range(5)


class Command(BaseCommand):
    help = "Create a demo institution with courses, sections, people, a timetable and notices."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DEBUG=true.")
        if Institution.objects.filter(slug="demo").exists():
            raise CommandError("Demo data already exists. Delete db.sqlite3 and migrate to reseed.")
        with transaction.atomic():
            self.seed()
        self.stdout.write(self.style.SUCCESS(f"Demo data created. Sign in with any *@{DOMAIN} "
                                             "account listed in the README."))

    def seed(self):
        today = timezone.localdate()
        inst = Institution.objects.create(name="Demo University", slug="demo")

        def scoped(model, **kw):
            return model.objects.create(institution=inst, **kw)

        cs = scoped(Department, name="Computer Science", code="CS")
        math = scoped(Department, name="Mathematics", code="MATH")
        hum = scoped(Department, name="Humanities", code="HUM")
        phy = scoped(Department, name="Physics", code="PHY")
        bscs = scoped(Program, department=cs, name="BS Computer Science", code="BSCS")
        term = scoped(
            AcademicTerm, name=f"Fall {today.year}", code=f"F{today:%y}",
            starts_on=today - timedelta(days=60), ends_on=today + timedelta(days=60),
            is_current=True,
        )

        C = Course.Color
        courses = {
            "CS-301": scoped(Course, department=cs, code="CS-301", title="Data Structures",
                             color=C.LAGOON),
            "MATH-210": scoped(Course, department=math, code="MATH-210", title="Linear Algebra",
                               color=C.TANGERINE),
            "ENG-105": scoped(Course, department=hum, code="ENG-105", title="Technical Writing",
                              color=C.ORCHID),
            "PHY-150": scoped(Course, department=phy, code="PHY-150", title="Physics I",
                              color=C.ROSE),
            "CS-110": scoped(Course, department=cs, code="CS-110",
                             title="Programming Fundamentals", color=C.SKY),
        }

        def section(code, sec):
            offering, _ = CourseOffering.objects.get_or_create(
                institution=inst, course=courses[code], term=term
            )
            return scoped(Section, offering=offering, code=sec, program=bscs)

        s = {
            "CS-301 3B": section("CS-301", "3B"),
            "CS-301 3C": section("CS-301", "3C"),
            "MATH-210 2A": section("MATH-210", "2A"),
            "ENG-105 1C": section("ENG-105", "1C"),
            "PHY-150 1B": section("PHY-150", "1B"),
            "CS-110 1A": section("CS-110", "1A"),
        }

        def person(local, first, last, kind):
            user = User.objects.create_user(
                email=f"{local}@{DOMAIN}", password=DEMO_PASSWORD, first_name=first,
                last_name=last, kind=kind, institution=inst,
            )
            EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
            return user

        K = User.Kind
        ayesha = person("ayesha", "Ayesha", "Khan", K.STUDENT)
        hamza = person("hamza", "Hamza", "Malik", K.STUDENT)
        sara = person("sara", "Sara", "Ahmed", K.STUDENT)
        imran = person("imran", "Imran", "Saleem", K.TEACHER)
        farah = person("farah", "Farah", "Iqbal", K.TEACHER)
        hina = person("hina", "Hina", "Raza", K.TEACHER)
        usman = person("usman", "Usman", "Tariq", K.TEACHER)
        nadia = person("nadia", "Nadia", "Qureshi", K.STAFF)
        scoped(RoleAssignment, user=nadia, role=RoleAssignment.Role.INSTITUTION_ADMIN)

        for key, teacher in [("CS-301 3B", imran), ("CS-301 3C", imran), ("MATH-210 2A", farah),
                             ("ENG-105 1C", usman), ("PHY-150 1B", hina), ("CS-110 1A", imran)]:
            scoped(TeacherAssignment, section=s[key], teacher=teacher)
        for student, keys in [
            (ayesha, ["CS-301 3B", "MATH-210 2A", "ENG-105 1C", "PHY-150 1B"]),
            (hamza, ["CS-301 3B", "MATH-210 2A"]),
            (sara, ["CS-301 3C", "ENG-105 1C"]),
        ]:
            for key in keys:
                scoped(SectionEnrollment, section=s[key], student=student)

        rooms = {code: scoped(Room, code=code, building=building) for code, building in [
            ("A-112", "Block A"), ("A-301", "Block A"), ("B-204", "Block B"),
            ("B-210", "Block B"), ("CS Lab 2", "Block B"), ("Physics Lab 1", "Science Block"),
        ]}
        M = ClassMeeting
        timetable = [
            ("MATH-210 2A", [MON, WED, THU], time(8, 30), time(9, 50), "A-112", M.Kind.LECTURE),
            ("CS-301 3B", [TUE, THU], time(10, 30), time(11, 50), "B-204", M.Kind.LECTURE),
            ("CS-301 3C", [MON, THU], time(14, 30), time(15, 50), "CS Lab 2", M.Kind.LAB),
            ("ENG-105 1C", [TUE, THU], time(13, 0), time(14, 20), None, M.Kind.LECTURE),
            ("PHY-150 1B", [MON], time(13, 0), time(14, 20), "Physics Lab 1", M.Kind.LECTURE),
            ("PHY-150 1B", [THU], time(15, 0), time(16, 50), "Physics Lab 1", M.Kind.LAB),
            ("CS-110 1A", [WED, FRI], time(16, 0), time(17, 20), "A-301", M.Kind.LECTURE),
        ]
        meetings = {}
        for key, days, start, end, room, kind in timetable:
            for day in days:
                online = room is None
                meetings[(key, day)] = scoped(
                    ClassMeeting, section=s[key], weekday=day, starts_at=start, ends_at=end,
                    kind=kind, room=rooms.get(room),
                    mode=M.Mode.ONLINE if online else M.Mode.IN_PERSON,
                    online_url="https://meet.example.com/eng-105-1c" if online else "",
                )

        def next_weekday(weekday):
            return today + timedelta(days=(weekday - today.weekday()) % 7 or 7)

        lab_day = next_weekday(THU)
        scoped(
            ScheduleChange, meeting=meetings[("PHY-150 1B", THU)], date=lab_day,
            status=ScheduleChange.Status.MOVED, new_date=lab_day + timedelta(days=4),
            new_starts_at=time(15, 0), new_ends_at=time(16, 50),
            note="Lab equipment is being serviced", created_by=hina,
        )
        scoped(
            ScheduleChange, meeting=meetings[("CS-301 3B", TUE)], date=next_weekday(TUE),
            status=ScheduleChange.Status.ROOM_CHANGED, new_room=rooms["B-210"],
            note="B-204 projector repair", created_by=nadia,
        )

        add_demo_assignments(s["CS-301 3B"], imran, s["MATH-210 2A"], farah)
        add_demo_posts(inst, s["CS-301 3B"], ayesha, hamza, imran, nadia)

        publish_notice(
            author=nadia,
            notice=Notice(title="Mid-term exam schedule published", priority="important",
                          body="The mid-term schedule for all CS courses is now on the "
                               "department notice board and in your timetable."),
            targets=[("department", cs.pk)],
        )
        publish_notice(
            author=imran,
            notice=Notice(title="Quiz 3 covers lists and stacks",
                          body="Trees are not in Quiz 3. Bring a pencil; the quiz is on paper "
                               "at the start of Thursday's class."),
            targets=[("section", s["CS-301 3B"].pk)],
        )
        publish_notice(
            author=nadia,
            notice=Notice(title="Library open until 11 PM during exams",
                          body="Extended hours run until the end of the exam period."),
            targets=[("institution", inst.pk)],
        )


def add_demo_assignments(ds_section, ds_teacher, math_section, math_teacher):
    """Open work with near deadlines, so the student and teacher views have something in them."""
    from apps.assignments.services import create_assignment

    now = timezone.now()
    create_assignment(
        ds_teacher, section=ds_section, title="Lab 3: Linked lists",
        instructions="Implement a singly linked list with insert, delete and reverse.\n\n"
                     "Submit your source files (.py, .java or .cpp) or a zip. A recursive "
                     "reverse() earns a bonus mark.",
        available_from=now - timedelta(days=3), due_at=now + timedelta(days=2),
        submission_type="file", max_points=20, max_attempts=2,
    )
    create_assignment(
        ds_teacher, section=ds_section, title="Reading response: Big-O",
        instructions="In 200 to 300 words, explain why binary search is O(log n).",
        available_from=now - timedelta(days=1), due_at=now + timedelta(days=5),
        submission_type="text", max_points=5,
    )
    create_assignment(
        math_teacher, section=math_section, title="Problem set 4",
        instructions="Questions 1 to 8 from chapter 5. Scans or typed answers are both fine.",
        available_from=now - timedelta(days=2), due_at=now + timedelta(days=4),
        submission_type="both", max_points=10, allow_late=True,
        late_until=now + timedelta(days=6),
    )


def add_demo_posts(institution, section, student, classmate, teacher, admin):
    """A little life in the feed: a question, a teacher reminder and a campus welcome."""
    from apps.feed.services import add_comment, create_post

    create_post(admin, body="Welcome to CampusVerse! Ask questions in your section's space, "
                "and share notes and resources with your classmates.",
                targets=[("institution", institution.pk)])
    create_post(teacher, body="Office hours move to Tuesday 2 to 4 PM this week, room F-12.",
                targets=[("section", section.pk)])
    question = create_post(classmate, body="Does anyone have the whiteboard notes from Thursday? "
                           "I missed the last 20 minutes.", targets=[("section", section.pk)])
    add_comment(student, question, body="I took photos, I'll post them after class.")
