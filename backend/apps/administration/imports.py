"""The Smart Sync pipeline (SRS 6.4, 11.4): a table comes in (an upload, or a scheduled fetch
from a SyncSource), each row is validated and matched by a stable key (never by names alone),
and the result is a preview. Nothing changes until it's applied, the plan is re-checked at
apply time, and records missing from a file are reported, never deleted.

Kinds: timetable (this module), people and enrollment (import_kinds.py).
"""

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, time

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.academic.models import AcademicTerm, Section
from apps.core.files import store_upload
from apps.governance import audit
from apps.scheduling.models import ClassMeeting, Room

from .models import ImportRun
from .people import require_admin
from .tables import finish_plan, read_table

REQUIRED = ["course_code", "section", "day", "start", "end", "room"]
TEMPLATE_HEADER = REQUIRED + ["kind", "mode"]
DAYS = {
    name: i
    for i, names in enumerate([
        ("mon", "monday"), ("tue", "tues", "tuesday"), ("wed", "wednesday"),
        ("thu", "thur", "thurs", "thursday"), ("fri", "friday"), ("sat", "saturday"),
        ("sun", "sunday"),
    ])
    for name in names
}
DAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@dataclass
class PlanRow:
    line: int
    status: str  # new | update | unchanged | error
    section: str = ""
    day: str = ""
    start: str = ""
    end: str = ""
    room: str = ""
    kind: str = ""
    mode: str = ""
    changes: dict = field(default_factory=dict)  # field -> [old, new]
    message: str = ""
    clash: str = ""
    meeting_id: int | None = None
    section_id: int | None = None
    room_id: int | None = None


def _parse_time(value: str) -> time:
    value = value.strip().upper()  # "2:30 pm" -> "2:30 PM" for %p
    for fmt in ("%H:%M", "%H.%M", "%I:%M %p", "%I:%M%p", "%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    raise ValueError(f"“{value}” isn't a time (use 24-hour HH:MM)")


def current_term(institution_id: int) -> AcademicTerm:
    term = AcademicTerm.objects.filter(institution_id=institution_id, is_current=True).first()
    if term is None:
        raise ValidationError("Mark a term as current before importing.")
    return term


def read_csv(raw: bytes) -> list[dict]:
    """Kept for callers that only deal in CSV."""
    return read_table(raw, "upload.csv", REQUIRED)


# Timetable ----------------------------------------------------------------------------------


def build_plan(institution_id: int, term: AcademicTerm, rows: list[dict]) -> dict:
    sections = {
        (s.offering.course.code.lower(), s.code.lower()): s
        for s in Section.objects.filter(
            institution_id=institution_id, offering__term=term
        ).select_related("offering__course")
    }
    rooms = {r.code.lower(): r for r in Room.objects.filter(institution_id=institution_id)}
    existing = {
        (m.section_id, m.weekday, m.starts_at): m
        for m in ClassMeeting.objects.filter(section__in=sections.values()).select_related("room")
    }
    kinds = set(ClassMeeting.Kind.values)
    modes = {"in_person": "in_person", "in person": "in_person", "online": "online", "": ""}

    plan: list[PlanRow] = []
    seen: dict[tuple, int] = {}
    for i, r in enumerate(rows, start=2):  # line 1 is the header
        row = PlanRow(line=i, status="error", section=f"{r.get('course_code', '')} · "
                      f"{r.get('section', '')}", room=r.get("room", ""))
        plan.append(row)
        section = sections.get((r.get("course_code", "").lower(), r.get("section", "").lower()))
        if section is None:
            row.message = f"There's no section {row.section} in {term.name}."
            continue
        row.section_id = section.pk
        day = DAYS.get(r.get("day", "").lower())
        if day is None:
            row.message = f"“{r.get('day')}” isn't a day (use Mon, Tue, …)."
            continue
        row.day = DAY_LABEL[day]
        try:
            starts, ends = _parse_time(r.get("start", "")), _parse_time(r.get("end", ""))
        except ValueError as err:
            row.message = f"{err}."
            continue
        row.start, row.end = f"{starts:%H:%M}", f"{ends:%H:%M}"
        if ends <= starts:
            row.message = "The class has to end after it starts."
            continue
        kind = (r.get("kind") or "lecture").lower()
        mode = modes.get((r.get("mode") or "").lower())
        if kind not in kinds or mode is None:
            row.message = "Kind must be lecture, lab or tutorial; mode in_person or online."
            continue
        mode = mode or ("online" if not row.room or row.room.lower() == "online" else "in_person")
        row.kind, row.mode = kind, mode
        room = None
        if mode == "in_person":
            room = rooms.get(row.room.lower())
            if room is None:
                row.message = f"Room {row.room or '(blank)'} doesn't exist. Add it first."
                continue
            row.room_id = room.pk
        key = (section.pk, day, starts)
        if key in seen:
            row.message = f"Same class as line {seen[key]}."
            continue
        seen[key] = i

        current = existing.get(key)
        if current is None:
            row.status = "new"
            continue
        row.meeting_id = current.pk
        diffs = {
            "end": [f"{current.ends_at:%H:%M}", row.end],
            "room": [current.room.code if current.room else "Online",
                     room.code if room else "Online"],
            "kind": [current.kind, kind],
            "mode": [current.mode, mode],
        }
        row.changes = {k: v for k, v in diffs.items() if v[0] != v[1]}
        row.status = "update" if row.changes else "unchanged"

    # Room clashes in the resulting timetable (warnings: the timetable team decides).
    by_slot: dict[tuple, list[PlanRow]] = {}
    for row in plan:
        if row.status in ("new", "update", "unchanged") and row.room_id:
            by_slot.setdefault((row.room_id, row.day), []).append(row)
    for group in by_slot.values():
        group.sort(key=lambda x: x.start)
        for a_i, a in enumerate(group):
            for b in group[a_i + 1:]:
                if b.start < a.end:
                    a.clash = a.clash or f"Same room as {b.section} at {b.start}."
                    b.clash = b.clash or f"Same room as {a.section} at {a.start}."

    in_file = {(r.section_id, DAYS[r.day.lower()], r.start) for r in plan if r.day and r.start}
    not_in_file = [
        f"{m.section.offering.course.code} · {m.section.code} {DAY_LABEL[m.weekday]} "
        f"{m.starts_at:%H:%M}"
        for key, m in existing.items()
        if (key[0], key[1], f"{key[2]:%H:%M}") not in in_file
    ]
    return finish_plan(
        [asdict(r) | {"label": r.section,
                      "detail": " ".join(filter(None, [r.day, r.start and f"{r.start}–{r.end}",
                                                       r.room or (r.mode == "online" and "Online")
                                                       or ""]))}
         for r in plan],
        not_in_file, extra={"clash": sum(1 for r in plan if r.clash)},
    )


def _timetable_signature(plan: dict) -> list:
    return [
        (r["status"], r["section_id"], r["day"], r["start"], r["end"], r["room_id"], r["kind"],
         r["mode"], r["meeting_id"])
        for r in plan["rows"] if r["status"] in ("new", "update")
    ]


def _apply_timetable(run: ImportRun, plan: dict, actor) -> dict:
    created = updated = 0
    for r in plan["rows"]:
        if r["status"] not in ("new", "update"):
            continue
        values = {"ends_at": time.fromisoformat(r["end"]), "room_id": r["room_id"],
                  "kind": r["kind"], "mode": r["mode"], "last_import": run}
        if r["status"] == "new":
            ClassMeeting.objects.create(
                institution_id=run.institution_id, section_id=r["section_id"],
                weekday=DAYS[r["day"].lower()], starts_at=time.fromisoformat(r["start"]),
                **values,
            )
            created += 1
        else:
            meeting = ClassMeeting.objects.get(pk=r["meeting_id"])
            for k, v in values.items():
                setattr(meeting, k, v)
            meeting.save()  # keeps simple-history records of every changed class
            updated += 1
    # Classes the file confirmed as they are count as synchronized too (FR-SCH-06).
    confirmed = [r["meeting_id"] for r in plan["rows"] if r["status"] == "unchanged"]
    ClassMeeting.objects.filter(pk__in=confirmed).update(last_import=run)
    return {"created": created, "updated": updated, "confirmed": len(confirmed),
            "skipped": plan["summary"]["error"]}


# The pipeline -------------------------------------------------------------------------------


@dataclass
class Kind:
    required: list[str]
    template: str  # header line and one example row
    needs_term: bool
    build: callable
    signature: callable
    apply: callable  # (run, plan, actor) -> result


def kinds() -> dict[str, Kind]:
    from . import import_kinds as k

    return {
        ImportRun.Kind.TIMETABLE: Kind(
            REQUIRED, ",".join(TEMPLATE_HEADER)
            + "\nCS-301,3B,Thu,10:30,11:50,B-204,lecture,in_person\n",
            True, build_plan, _timetable_signature, _apply_timetable,
        ),
        ImportRun.Kind.PEOPLE: Kind(
            k.PEOPLE_REQUIRED, k.PEOPLE_TEMPLATE, False,
            k.build_people, k.people_signature, k.apply_people,
        ),
        ImportRun.Kind.ENROLLMENT: Kind(
            k.ENROLLMENT_REQUIRED, k.ENROLLMENT_TEMPLATE, True,
            k.build_enrollment, k.enrollment_signature, k.apply_enrollment,
        ),
    }


def kind_of(name: str) -> Kind:
    found = kinds().get(name)
    if found is None:
        raise ValidationError("Unknown kind of import.")
    return found


def _plan_for(run_or_kind: str, institution_id: int, term, raw: bytes, filename: str) -> dict:
    k = kind_of(run_or_kind)
    return k.build(institution_id, term, read_table(raw, filename, k.required))


def _signature(kind: str, plan: dict) -> str:
    actions = kind_of(kind).signature(plan)
    return hashlib.sha256(json.dumps(actions, sort_keys=True, default=str).encode()).hexdigest()


def preview(admin, upload, kind: str = ImportRun.Kind.TIMETABLE, *, source=None) -> ImportRun:
    require_admin(admin)
    k = kind_of(kind)
    name = (upload.name or "").lower()
    if not name.endswith((".csv", ".xlsx")):
        raise ValidationError("Upload a .csv or .xlsx file.")
    term = current_term(admin.institution_id) if k.needs_term else None
    upload.seek(0)
    raw = upload.read()
    upload.seek(0)
    plan = _plan_for(kind, admin.institution_id, term, raw, name)  # check before storing
    stored = store_upload(admin, upload)
    run = ImportRun.objects.create(
        institution_id=admin.institution_id, kind=kind, source_file=stored, source=source,
        term=term, plan=plan, plan_signature=_signature(kind, plan), created_by=admin,
    )
    audit.record(actor=admin, action="import.previewed", target=run,
                 changes=plan["summary"] | ({"source": source.name} if source else {}))
    return run


@transaction.atomic
def apply(admin, run: ImportRun) -> ImportRun:
    require_admin(admin)
    run = ImportRun.objects.select_for_update().get(pk=run.pk)
    if run.status != ImportRun.Status.PREVIEW:
        raise ValidationError("This import was already applied or discarded.")
    with run.source_file.file.open("rb") as f:
        fresh = _plan_for(run.kind, run.institution_id, run.term, f.read(),
                          run.source_file.original_name)
    if _signature(run.kind, fresh) != run.plan_signature:
        raise ValidationError(
            "The data changed since this preview. Upload the file again to review the new "
            "differences."
        )
    run.result = kind_of(run.kind).apply(run, fresh, admin)
    run.status = ImportRun.Status.APPLIED
    run.applied_at = timezone.now()
    run.applied_by = admin
    run.save()
    audit.record(actor=admin, action="import.applied", target=run, changes=run.result)
    return run


def discard(admin, run: ImportRun) -> ImportRun:
    require_admin(admin)
    if run.status != ImportRun.Status.PREVIEW:
        raise ValidationError("Only an import waiting for review can be discarded.")
    run.status = ImportRun.Status.DISCARDED
    run.save(update_fields=["status", "updated_at"])
    audit.record(actor=admin, action="import.discarded", target=run)
    return run
