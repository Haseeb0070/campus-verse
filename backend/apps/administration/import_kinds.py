"""People and enrollment imports, in the same validate → preview → apply pipeline as the
timetable (imports.py). People are matched by the institution's own ID first, then by email.

Enrollment rows name a section (its short code) and a person:
- no course: the student joins the section, and so all its subjects (moving them from the
  section they're in, if any);
- with a course: that one subject of the section, for a teacher, or a student taking it from
  outside the section (a repeater, an elective).
Missing records are reported, never removed."""

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from apps.academic.models import Cohort, CohortMember, Section
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.identity.models import User

from .tables import finish_plan

KINDS = {"student", "teacher", "staff"}

PEOPLE_REQUIRED = ["email", "first_name", "last_name", "kind"]
PEOPLE_TEMPLATE = (
    "email,first_name,last_name,kind,external_id\n"
    "ayesha.k@uni.edu,Ayesha,Khan,student,2023-CS-118\n"
)
ENROLLMENT_REQUIRED = ["section", "person"]
ENROLLMENT_TEMPLATE = (
    "section,person,course_code,role\n"
    "BSCS24-MA,2024-CS-118,,student\n"
    "BSCS24-MA,imran.s@uni.edu,CS-301,teacher\n"
)


def _row(line: int, **kw) -> dict:
    return {"line": line, "status": "error", "label": "", "detail": "", "changes": {},
            "message": "", "clash": ""} | kw


# People -------------------------------------------------------------------------------------


def build_people(institution_id: int, term, rows: list[dict]) -> dict:
    people = list(User.objects.filter(email__in=[r.get("email", "").lower() for r in rows])
                  | User.objects.filter(institution_id=institution_id).exclude(external_id=""))
    by_email = {u.email.lower(): u for u in people}
    by_id = {u.external_id: u for u in people if u.institution_id == institution_id and
             u.external_id}
    plan, seen = [], {}
    for i, r in enumerate(rows, start=2):
        email = r.get("email", "").strip().lower()
        first, last = r.get("first_name", "").strip(), r.get("last_name", "").strip()
        kind = r.get("kind", "").strip().lower()
        ext = r.get("external_id", "").strip()
        row = _row(i, label=f"{first} {last}".strip() or email, detail=f"{email} · {kind}",
                   email=email, first_name=first, last_name=last, kind=kind, external_id=ext,
                   user_id=None)
        plan.append(row)
        try:
            validate_email(email)
        except ValidationError:
            row["message"] = f"“{email}” isn't an email address."
            continue
        if kind not in KINDS:
            row["message"] = "Kind must be student, teacher or staff."
            continue
        if not first:
            row["message"] = "A first name is needed."
            continue
        if email in seen:
            row["message"] = f"Same email as line {seen[email]}."
            continue
        seen[email] = i
        match = by_id.get(ext) if ext else None
        if match and match.email.lower() != email:
            row["message"] = f"ID {ext} belongs to {match.email}. Fix the email or the ID."
            continue
        match = match or by_email.get(email)
        if match is None:
            row["status"] = "new"
            continue
        if match.institution_id != institution_id:
            row["message"] = "That email is used by an account at another institution."
            continue
        row["user_id"] = match.pk
        wanted = {"first_name": first, "last_name": last, "kind": kind,
                  "external_id": ext or match.external_id}
        row["changes"] = {k: [getattr(match, k), v] for k, v in wanted.items()
                          if getattr(match, k) != v}
        row["status"] = "update" if row["changes"] else "unchanged"
    return finish_plan(plan, [])  # people missing from a file are never deactivated by import


def people_signature(plan: dict) -> list:
    return [(r["status"], r["email"], r["first_name"], r["last_name"], r["kind"],
             r["external_id"], r["user_id"]) for r in plan["rows"]
            if r["status"] in ("new", "update")]


def apply_people(run, plan: dict, actor) -> dict:
    from .people import invite

    created = updated = 0
    for r in plan["rows"]:
        if r["status"] == "new":
            user = invite(actor, email=r["email"],
                          first_name=r["first_name"], last_name=r["last_name"], kind=r["kind"])
            if r["external_id"]:
                user.external_id = r["external_id"]
                user.save(update_fields=["external_id"])
            created += 1
        elif r["status"] == "update":
            user = User.objects.get(pk=r["user_id"])
            for name, (_, new) in r["changes"].items():
                setattr(user, name, new)
            user.save(update_fields=list(r["changes"]))
            updated += 1
    return {"created": created, "invited": created, "updated": updated,
            "skipped": plan["summary"]["error"]}


# Enrollment ---------------------------------------------------------------------------------


def build_enrollment(institution_id: int, term, rows: list[dict]) -> dict:
    sections = {
        (s.offering.course.code.lower(), s.code.lower()): s
        for s in Section.objects.filter(institution_id=institution_id, offering__term=term)
        .select_related("offering__course")
    }
    cohorts = {c.code.lower(): c for c in Cohort.objects.filter(institution_id=institution_id,
                                                                status=Cohort.Status.ACTIVE)}
    places = {m.student_id: m.cohort for m in CohortMember.objects.filter(
        cohort__in=cohorts.values(), status=CohortMember.Status.ACTIVE).select_related("cohort")}
    members = User.objects.filter(institution_id=institution_id)
    by_email = {u.email.lower(): u for u in members}
    by_id = {u.external_id: u for u in members if u.external_id}
    enrollments = {(e.section_id, e.student_id): e for e in
                   SectionEnrollment.objects.filter(section__in=sections.values())}
    teaching = set(TeacherAssignment.objects.filter(section__in=sections.values())
                   .values_list("section_id", "teacher_id"))
    plan, seen, touched = [], {}, set()
    for i, r in enumerate(rows, start=2):
        code, sec = (r.get("course_code") or "").strip(), (r.get("section") or "").strip()
        who = (r.get("person") or "").strip()
        role = (r.get("role") or "student").strip().lower()
        row = _row(i, label=who, detail=f"{code} · {sec} · {role}" if code else f"{sec} · {role}",
                   role=role, section_id=None, cohort_id=None, user_id=None)
        plan.append(row)
        cohort = cohorts.get(sec.lower())
        section = sections.get((code.lower(), sec.lower())) if code else None
        if code and section is None:
            row["message"] = (f"Section {sec} has no subject {code} in {term.name}."
                              if cohort else f"There's no subject {code} · {sec} in {term.name}.")
            continue
        if not code and cohort is None:
            row["message"] = f"There's no section {sec}. Add it in Sections & subjects first."
            continue
        person = by_id.get(who) or by_email.get(who.lower())
        if person is None:
            row["message"] = f"Nobody here has the email or ID “{who}”. Import people first."
            continue
        row["label"] = person.get_full_name() or person.email
        if role not in ("student", "teacher"):
            row["message"] = "Role must be student or teacher."
            continue
        if role == "student" and person.kind != User.Kind.STUDENT:
            row["message"] = f"{person.email} isn't a student."
            continue
        if role == "teacher" and person.kind == User.Kind.STUDENT:
            row["message"] = f"{person.email} is a student, not a teacher."
            continue
        if role == "teacher" and not code:
            row["message"] = "Give the course a teacher teaches."
            continue
        key = (section.pk if section else f"c{cohort.pk}", person.pk, role)
        if key in seen:
            row["message"] = f"Same as line {seen[key]}."
            continue
        seen[key] = i
        row["user_id"] = person.pk
        if not code:  # the whole section
            row["cohort_id"] = cohort.pk
            now = places.get(person.pk)
            if now is None:
                row["status"] = "new"
            elif now.pk == cohort.pk:
                row["status"] = "unchanged"
            else:
                row["status"] = "update"
                row["changes"] = {"section": [now.code, cohort.code]}
            continue
        row["section_id"] = section.pk
        touched.add(section.pk)
        if role == "teacher":
            row["status"] = "unchanged" if (section.pk, person.pk) in teaching else "new"
            continue
        current = enrollments.get((section.pk, person.pk))
        if current is None:
            row["status"] = "new"
        elif current.status != SectionEnrollment.Status.ACTIVE:
            row["status"] = "update"
            row["changes"] = {"status": [current.status, "active"]}
        else:
            row["status"] = "unchanged"
    listed = {(r["section_id"], r["user_id"]) for r in plan if r["status"] != "error"}
    not_in_file = [
        f"{e.student} in {e.section}" for (sid, uid), e in enrollments.items()
        if sid in touched and e.status == SectionEnrollment.Status.ACTIVE
        and (sid, uid) not in listed
    ]
    return finish_plan(plan, not_in_file)


def enrollment_signature(plan: dict) -> list:
    return [(r["status"], r["section_id"], r.get("cohort_id"), r["user_id"], r["role"])
            for r in plan["rows"] if r["status"] in ("new", "update")]


def apply_enrollment(run, plan: dict, actor) -> dict:
    from .cohorts import add_students

    enrolled = assigned = reactivated = joined = 0
    for r in plan["rows"]:
        if r["status"] not in ("new", "update"):
            continue
        if r.get("cohort_id"):  # into the section and all its subjects, moving if need be
            cohort = Cohort.objects.get(pk=r["cohort_id"])
            joined += add_students(actor, cohort, [r["user_id"]], move=True)
            continue
        if r["role"] == "teacher":
            TeacherAssignment.objects.get_or_create(
                section_id=r["section_id"], teacher_id=r["user_id"],
                defaults={"institution_id": run.institution_id},
            )
            assigned += 1
            continue
        enrollment, created = SectionEnrollment.objects.get_or_create(
            section_id=r["section_id"], student_id=r["user_id"],
            defaults={"institution_id": run.institution_id},
        )
        if not created:
            enrollment.status = SectionEnrollment.Status.ACTIVE
            enrollment.save()  # history keeps the old status; the signal refreshes access
            reactivated += 1
        else:
            enrolled += 1
    return {"enrolled": enrolled, "reactivated": reactivated, "teachers_assigned": assigned,
            "joined_sections": joined, "skipped": plan["summary"]["error"]}


