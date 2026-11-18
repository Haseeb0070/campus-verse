from django.db import migrations, models


def keep_one_per_person(apps, schema_editor):
    """Helpful, thanks and agree collapse into a single like: keep each person's earliest one."""
    Reaction = apps.get_model("feed", "Reaction")
    seen = set()
    extra = []
    for pk, post_id, user_id in Reaction.objects.order_by("created_at", "id").values_list(
        "pk", "post_id", "user_id"
    ):
        if (post_id, user_id) in seen:
            extra.append(pk)
        else:
            seen.add((post_id, user_id))
    Reaction.objects.filter(pk__in=extra).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("feed", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(keep_one_per_person, migrations.RunPython.noop),
        migrations.RemoveConstraint(model_name="reaction", name="uniq_reaction"),
        migrations.RemoveField(model_name="reaction", name="kind"),
        migrations.AddConstraint(
            model_name="reaction",
            constraint=models.UniqueConstraint(fields=("post", "user"), name="one_reaction_per_person"),
        ),
    ]
