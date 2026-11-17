"""Set up Govt. Graduate College of Science, Wahdat Road, Lahore: BS CS 5th semester (G1+G2).

Source: the college's 5th Semester Morning Shift timetable (Session 2023-2028), w.e.f. 05-10-2026.
Only the BS CS row is used; G1 and G2 sit together as one class. On the timetable "(1-3)" means the
first three days of the week (Monday to Wednesday) and "(4-6)" means Thursday to Saturday.

The first run replaces everything in the database (the demo university, test chats, everyone) with
the college. Later runs see the college is there and do nothing, so it is safe in a start script.

Every account gets the password in SEED_PASSWORD; without it, nothing is changed.
"""

import os
from datetime import date, time

from allauth.account.models import EmailAddress
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.academic.models import (
    AcademicTerm,
    Course,
    CourseOffering,
    Department,
    Institution,
    Program,
    Section,
)
from apps.enrollment.models import TeacherAssignment
from apps.identity.models import RoleAssignment, User
from apps.scheduling.models import ClassMeeting, Room

SLUG = "gcs-lahore"
SECTION = "G1+G2"
MON_WED = [0, 1, 2]  # "(1-3)" on the timetable
THU_SAT = [3, 4, 5]  # "(4-6)"

# (local part of the email, first name, last name). Names are as printed on the timetable.
TEACHERS = {
    "nabeel": ("nabeel", "Nabeel", ""),
    "mati": ("mati.urrehman", "Mati ur", "Rehman"),
    "rawa": ("rawa", "Rawa", ""),
    "sadaf": ("sadaf", "Sadaf", ""),
}

C = Course.Color
# code: (title, colour, teacher). Titles expand the timetable's short names.
COURSES = {
    "EC-330": ("Web Engineering", C.SKY, "nabeel"),
    "HQ-005": ("Translation of the Holy Quran", C.GOLD, "mati"),
    "CC-310": ("Artificial Intelligence", C.ORCHID, "nabeel"),
    "DC-322": ("Computer Architecture", C.SLATE, "rawa"),
    "CC-320": ("Theory of Automata", C.LAGOON, "sadaf"),
    "CC-313": ("Design and Analysis of Algorithms", C.TANGERINE, "nabeel"),
    "DC-321": ("Human-Computer Interaction", C.ROSE, "rawa"),
}

# code, days, start, end, room: every BS CS (G1+G2) slot on the timetable.
TIMETABLE = [
    ("EC-330", THU_SAT, time(8, 30), time(9, 30), "R-127"),
    ("HQ-005", THU_SAT, time(9, 30), time(10, 30), "R-27"),
    ("CC-310", MON_WED, time(10, 45), time(11, 45), "R-127"),
    ("DC-322", THU_SAT, time(10, 45), time(11, 45), "R-127"),
    ("CC-320", MON_WED, time(11, 45), time(12, 45), "R-127"),
    ("CC-313", MON_WED, time(12, 45), time(13, 45), "R-127"),
    ("DC-321", THU_SAT, time(12, 45), time(13, 45), "R-127"),
]


class Command(BaseCommand):
    help = "Replace the demo data with Govt. Graduate College of Science (BS CS 5th semester)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--domain", default=os.environ.get("SEED_EMAIL_DOMAIN", "gcs.test"),
            help="Email domain for the accounts (default gcs.test, or SEED_EMAIL_DOMAIN).",
        )

    def handle(self, *args, domain, **options):
        if not (settings.DEBUG or settings.CAMPUSVERSE_DEMO_SEED):
            raise CommandError("seed_college only runs with DEBUG=true or DEMO_SEED=true.")
        if Institution.objects.filter(slug=SLUG).exists():
            self.stdout.write("Govt. Graduate College of Science is already set up; nothing to do.")
            return
        password = os.environ.get("SEED_PASSWORD", "")
        if len(password) < 10:
            self.stdout.write(self.style.WARNING(
                "Set SEED_PASSWORD (10 characters or more) to create the college; nothing changed."
            ))
            return

        # Start from an empty database: no demo university, test users or test messages left.
        call_command("flush", interactive=False, verbosity=0)
        with transaction.atomic():
            accounts = self.seed(domain, password)
        self.stdout.write(self.style.SUCCESS("Govt. Graduate College of Science is set up."))
        for email, who in accounts:
            self.stdout.write(f"  {email}  {who}")

    def seed(self, domain, password):
        inst = Institution.objects.create(
            name="Govt. Graduate College of Science, Lahore", slug=SLUG, timezone="Asia/Karachi",
            attendance_enabled=True, attendance_visible_to_students=True,
        )

        def scoped(model, **kw):
            return model.objects.create(institution=inst, **kw)

        cs = scoped(Department, name="Computer Science", code="CS")
        bscs = scoped(Program, department=cs, name="BS Computer Science (Session 2023-2028)",
                      code="BSCS")
        term = scoped(
            AcademicTerm, name="5th Semester, Fall 2026", code="F26-S5",
            starts_on=date(2026, 10, 5), ends_on=date(2027, 2, 27), is_current=True,
        )

        accounts = []

        def person(local, first, last, kind):
            email = f"{local}@{domain}"
            user = User.objects.create_user(
                email=email, password=password, first_name=first, last_name=last, kind=kind,
                institution=inst,
            )
            EmailAddress.objects.create(user=user, email=email, verified=True, primary=True)
            accounts.append((email, f"{first} {last}".strip() + f" ({kind})"))
            return user

        admin = person("admin", "College", "Admin", User.Kind.STAFF)
        scoped(RoleAssignment, user=admin, role=RoleAssignment.Role.INSTITUTION_ADMIN)
        teachers = {
            key: person(local, first, last, User.Kind.TEACHER)
            for key, (local, first, last) in TEACHERS.items()
        }

        sections = {}
        for code, (title, colour, teacher) in COURSES.items():
            course = scoped(Course, department=cs, code=code, title=title, color=colour)
            offering = scoped(CourseOffering, course=course, term=term)
            section = scoped(Section, offering=offering, code=SECTION, program=bscs)
            scoped(TeacherAssignment, section=section, teacher=teachers[teacher])
            sections[code] = section

        rooms = {code: scoped(Room, code=code, building="") for code in ("R-127", "R-27")}
        for code, days, start, end, room in TIMETABLE:
            for day in days:
                scoped(
                    ClassMeeting, section=sections[code], weekday=day, starts_at=start,
                    ends_at=end, kind=ClassMeeting.Kind.LECTURE, room=rooms[room],
                    mode=ClassMeeting.Mode.IN_PERSON,
                )
        return accounts
