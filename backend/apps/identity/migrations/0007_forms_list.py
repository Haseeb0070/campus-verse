"""BS CS 5th semester (G1+G2): the college roll number of each of the 56 students on the final
forms list, and the 10 students who are not on it, removed for good (the admin asked for that).
"""

from django.db import migrations
from django.db.models.deletion import ProtectedError

DOMAIN = "@gcslahore.edu.pk"

#: University roll number -> college roll number, from "5th Semester Forms List".
COLLEGE_ROLL = {
    "126143": "503",
    "126277": "504",
    "126144": "505",
    "126145": "507",
    "126233": "508",
    "126188": "510",
    "126176": "513",
    "126122": "514",
    "126174": "517",
    "126120": "518",
    "126173": "519",
    "126209": "520",
    "126151": "523",
    "126222": "524",
    "126169": "525",
    "126181": "526",
    "126135": "529",
    "126127": "530",
    "126166": "531",
    "126248": "533",
    "126136": "534",
    "126165": "537",
    "126213": "538",
    "126175": "539",
    "126199": "540",
    "126196": "546",
    "126235": "547",
    "126205": "549",
    "126139": "550",
    "126219": "552",
    "126204": "553",
    "126217": "554",
    "126149": "558",
    "126221": "565",
    "126117": "567",
    "126220": "569",
    "126178": "571",
    "126244": "573",
    "126211": "575",
    "126189": "576",
    "126274": "577",
    "126262": "578",
    "126275": "579",
    "126115": "580",
    "126276": "581",
    "126179": "583",
    "126156": "584",
    "126269": "585",
    "126249": "587",
    "126270": "588",
    "126261": "590",
    "126251": "591",
    "126267": "593",
    "126177": "595",
    "126246": "596",
    "126180": "597",
}

#: On the old list but not on the forms list: their accounts and everything tied to them go.
REMOVED = ["126265", "126167", "126154", "126236", "126271", "126288", "126264", "126203",
           "126250", "126239"]


def forward(apps, schema_editor):
    User = apps.get_model("identity", "User")
    students = User.objects.filter(kind="student", email__iendswith=DOMAIN)
    for uni, college in COLLEGE_ROLL.items():
        students.filter(external_id=uni).update(college_roll=college)
    for person in students.filter(external_id__in=REMOVED):
        try:
            person.delete()
        except ProtectedError:
            # Something they made can't go without breaking others' records: they can't sign in
            # and are in no class any more, which is the same for everyone using the app.
            Enrollment = apps.get_model("enrollment", "SectionEnrollment")
            Member = apps.get_model("academic", "CohortMember")
            Enrollment.objects.filter(student=person).delete()
            Member.objects.filter(student=person).delete()
            User.objects.filter(pk=person.pk).update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("identity", "0006_college_roll"),
        ("enrollment", "__latest__"),
        ("academic", "__latest__"),
    ]

    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
