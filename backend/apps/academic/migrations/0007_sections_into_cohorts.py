"""Turns today's classes into sections (cohorts).

Until now a class was only a shared code: every subject in a term with the code "G1+G2" was
taught to the same students. Each distinct code (per program) becomes one Cohort; its subjects
point to it, and the students of its most recent term's subjects become its members. A code used
by two programs becomes two sections, the program's code added to each ("3B-BSCS", "3B-BSM").
"""

from collections import Counter, defaultdict

from django.db import migrations


def forwards(apps, schema_editor):
    Section = apps.get_model("academic", "Section")
    Cohort = apps.get_model("academic", "Cohort")
    CohortMember = apps.get_model("academic", "CohortMember")
    SectionEnrollment = apps.get_model("enrollment", "SectionEnrollment")

    Program = apps.get_model("academic", "Program")

    # The same code in two programs ("3B" in BS CS and in BS Maths) is two groups of students.
    groups = defaultdict(list)
    for s in Section.objects.select_related("offering__term").order_by("id"):
        groups[(s.institution_id, s.code.strip().upper(), s.program_id)].append(s)
    programs_per_code = Counter((inst, code) for inst, code, _ in groups)
    program_codes = dict(Program.objects.values_list("id", "code"))
    used = set()

    for (institution_id, code, program_id), sections in groups.items():
        latest = max(sections, key=lambda s: s.offering.term.starts_on).offering.term_id
        active = any(s.status == "active" for s in sections)
        if programs_per_code[(institution_id, code)] > 1:
            # Kept apart: the code gets the program's (or "X" for none), e.g. "3B-BSM".
            code = f"{code}-{program_codes.get(program_id, 'X')}".upper()
        unique, n = code[:16], 2
        while (institution_id, unique) in used:
            unique = f"{code[:13]}-{n}"
            n += 1
        used.add((institution_id, unique))
        cohort = Cohort.objects.create(
            institution_id=institution_id, code=unique, program_id=program_id,
            status="active" if active else "archived",
        )
        # A subject shows its section's code everywhere.
        Section.objects.filter(pk__in=[s.pk for s in sections]).update(cohort=cohort, code=unique)
        students = set(SectionEnrollment.objects.filter(
            section__in=[s for s in sections if s.offering.term_id == latest],
            status__in=["active", "completed"],
        ).values_list("student_id", flat=True))
        CohortMember.objects.bulk_create([
            CohortMember(institution_id=institution_id, cohort=cohort, student_id=sid)
            for sid in students
        ])


class Migration(migrations.Migration):
    dependencies = [
        ("academic", "0006_cohorts"),
        ("enrollment", "0002_initial"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
