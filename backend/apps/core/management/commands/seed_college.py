"""Set up Govt. Graduate College of Science, Wahdat Road, Lahore: BS CS 5th semester, the
section BSCS24 (BS Computer Science · 2024–2028 · Morning).

Source: the college's 5th Semester Morning Shift timetable, w.e.f. 05-10-2026. Only the BS CS row
is used; G1 and G2 sit together as one section. On the timetable "(1-3)" means the first three
days of the week (Monday to Wednesday) and "(4-6)" means Thursday to Saturday.

The first run replaces everything in the database (the demo university, test chats, everyone) with
the college. So does the first run after REBUILD changes: a deliberate fresh start, done once and
remembered in the audit log, so restarts never wipe anything again. Every run then makes sure the
course titles match and that each student on the class list (apps/core/gcs_students.py) has an
account, is in the section and is enrolled in all seven subjects. Nothing else is touched on later
runs, so it is safe in a start script.

New accounts get the password in SEED_PASSWORD; without it, no account is created.
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
    Cohort,
    CohortMember,
    Course,
    CourseOffering,
    Department,
    Institution,
    Program,
    Section,
)
from apps.core.gcs_students import STUDENT_EMAIL_DOMAIN, STUDENTS, split_name
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.governance.models import AuditLog
from apps.identity.models import RoleAssignment, User
from apps.scheduling.models import ClassMeeting, Room

SLUG = "gcs-lahore"
SECTION = "BSCS24"
#: Change this to start the college over once more on the next start (everything is replaced).
REBUILD = "2026-11-25: section BSCS24"
REBUILT = "seed.rebuilt"
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
    "EC-330": ("Web Development", C.SKY, "nabeel"),
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
            "--domain", default=os.environ.get("SEED_EMAIL_DOMAIN", STUDENT_EMAIL_DOMAIN),
            help="Email domain for staff accounts (default gcslahore.edu.pk; SEED_EMAIL_DOMAIN).",
        )
        parser.add_argument(
            "--reset", action="store_true",
            help="Rebuild from scratch even if the college exists (empties the database first).",
        )

    def handle(self, *args, domain, reset=False, **options):
        if not (settings.DEBUG or settings.CAMPUSVERSE_DEMO_SEED):
            raise CommandError("seed_college only runs with DEBUG=true or DEMO_SEED=true.")
        password = os.environ.get("SEED_PASSWORD", "")
        if len(password) < 10:
            self.stdout.write(self.style.WARNING(
                "Set SEED_PASSWORD (10 characters or more) to set up the college; nothing changed."
            ))
            return

        inst = None if reset else Institution.objects.filter(slug=SLUG).first()
        if inst is not None and not self.rebuilt():
            self.stdout.write(self.style.WARNING(f"Starting the college over ({REBUILD})."))
            inst = None
        if inst is None:
            # Start from an empty database: no demo university, test users or test messages left.
            call_command("flush", interactive=False, verbosity=0)
            with transaction.atomic():
                accounts = self.seed(domain, password)
                AuditLog.objects.create(institution=Institution.objects.get(slug=SLUG),
                                        action=REBUILT, changes={"rebuild": REBUILD})
            self.stdout.write(self.style.SUCCESS("Govt. Graduate College of Science is set up."))
            for email, who in accounts:
                self.stdout.write(f"  {email}  {who}")
            inst = Institution.objects.get(slug=SLUG)

        with transaction.atomic():
            for code, (title, _, _) in COURSES.items():
                Course.objects.filter(institution=inst, code=code).exclude(title=title).update(
                    title=title
                )
            created, enrolled = self.enroll_students(inst, password)
        self.stdout.write(
            f"Students: {len(STUDENTS)} on the class list, {created} new accounts, "
            f"{enrolled} new enrolments."
        )

    def rebuilt(self) -> bool:
        """Whether this database has had the current fresh start (see REBUILD)."""
        return AuditLog.objects.filter(action=REBUILT, changes__rebuild=REBUILD).exists()

    def enroll_students(self, inst, password):
        """Every student on the class list has an account, is in the section and sits in all
        seven of its subjects."""
        cohort = Cohort.objects.filter(institution=inst, code=SECTION).first()
        sections = list(
            Section.objects.filter(
                institution=inst, code=SECTION, offering__course__code__in=COURSES,
                offering__term__is_current=True,
            )
        )
        created = enrolled = 0
        for college_roll, uni_roll, name in STUDENTS:
            email = f"{uni_roll}@{STUDENT_EMAIL_DOMAIN}"
            first, last = split_name(name)
            student = User.objects.filter(email=email).first()
            if student is not None and (student.first_name, student.last_name) != (first, last):
                # The class list is the source of truth for names (spelling fixes reach everyone).
                student.first_name, student.last_name = first, last
                student.save(update_fields=["first_name", "last_name"])
            if student is not None and student.college_roll != str(college_roll):
                student.college_roll = str(college_roll)
                student.save(update_fields=["college_roll"])
            if student is None:
                student = User.objects.create_user(
                    email=email, password=password, first_name=first, last_name=last,
                    kind=User.Kind.STUDENT, institution=inst, external_id=str(uni_roll),
                    college_roll=str(college_roll),
                )
                EmailAddress.objects.create(user=student, email=email, verified=True, primary=True)
                created += 1
            if cohort is not None:
                CohortMember.objects.get_or_create(institution=inst, cohort=cohort,
                                                   student=student)
            for section in sections:
                _, new = SectionEnrollment.objects.get_or_create(
                    institution=inst, section=section, student=student
                )
                enrolled += new
        return created, enrolled

    def seed(self, domain, password):
        inst = Institution.objects.create(
            name="Govt. Graduate College of Science, Lahore", slug=SLUG, timezone="Asia/Karachi",
            attendance_enabled=True, attendance_visible_to_students=True,
        )

        def scoped(model, **kw):
            return model.objects.create(institution=inst, **kw)

        cs = scoped(Department, name="Computer Science", code="CS")
        bscs = scoped(Program, department=cs, name="BS Computer Science", code="BSCS")
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

        cohort = scoped(Cohort, program=bscs, code=SECTION, start_year=2024, end_year=2028,
                        shift=Cohort.Shift.MORNING)
        sections = {}
        for code, (title, colour, teacher) in COURSES.items():
            course = scoped(Course, department=cs, code=code, title=title, color=colour)
            offering = scoped(CourseOffering, course=course, term=term)
            section = scoped(Section, offering=offering, cohort=cohort, code=SECTION, program=bscs)
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
