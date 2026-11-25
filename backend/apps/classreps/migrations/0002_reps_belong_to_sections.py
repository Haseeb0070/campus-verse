"""CRs and GRs move from a shared code ("G1+G2") to the section (cohort) with that code.

Where a section ended up with two CRs (or GRs) for a term, the most recently named one keeps it.
"""

import django.db.models.deletion
from django.db import migrations, models


def to_cohorts(apps, schema_editor):
    """Each CR/GR goes to the section of the subjects they sat in that term under the old code
    (the code may have gained a program suffix, "3B" -> "3B-BSCS", when two programs shared it)."""
    ClassRep = apps.get_model("classreps", "ClassRep")
    SectionEnrollment = apps.get_model("enrollment", "SectionEnrollment")
    seen = set()
    for rep in ClassRep.objects.order_by("-id"):
        old = rep.group_code.strip().upper()
        cohorts = {
            cohort_id for cohort_id, code in SectionEnrollment.objects.filter(
                student_id=rep.student_id, section__offering__term_id=rep.term_id,
                section__cohort__isnull=False,
            ).values_list("section__cohort_id", "section__cohort__code")
            if code.upper() == old or code.upper().startswith(old + "-")
        }
        cohort = min(cohorts) if len(cohorts) == 1 else None
        key = (rep.term_id, cohort, rep.role)
        if cohort is None or key in seen:
            rep.delete()
            continue
        seen.add(key)
        rep.cohort_id = cohort
        rep.save(update_fields=["cohort"])


def back_to_codes(apps, schema_editor):
    """Undoing: each CR/GR gets their section's code back as the shared class code."""
    ClassRep = apps.get_model("classreps", "ClassRep")
    for rep in ClassRep.objects.select_related("cohort"):
        rep.group_code = rep.cohort.code
        rep.save(update_fields=["group_code"])


class Migration(migrations.Migration):
    dependencies = [
        ("academic", "0007_sections_into_cohorts"),
        ("classreps", "0001_initial"),
        ("enrollment", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="classrep",
            name="cohort",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name="reps", to="academic.cohort"),
        ),
        migrations.RunPython(to_cohorts, back_to_codes),
        migrations.RemoveConstraint(model_name="classrep", name="one_rep_role_per_class"),
        # A default first, so undoing this migration can bring the column back.
        migrations.AlterField(model_name="classrep", name="group_code",
                              field=models.CharField(max_length=16, default="", blank=True)),
        migrations.RemoveField(model_name="classrep", name="group_code"),
        migrations.AlterField(
            model_name="classrep",
            name="cohort",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name="reps", to="academic.cohort"),
        ),
        migrations.AddConstraint(
            model_name="classrep",
            constraint=models.UniqueConstraint(fields=("student", "term", "cohort"),
                                               name="one_rep_role_per_section"),
        ),
        migrations.AddConstraint(
            model_name="classrep",
            constraint=models.UniqueConstraint(fields=("term", "cohort", "role"),
                                               name="one_holder_per_section_role"),
        ),
    ]
