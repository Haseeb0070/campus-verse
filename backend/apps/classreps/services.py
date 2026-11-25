"""What a CR or GR may do, and the path each request takes.

- A CR/GR acts for their class: the sections of their term with the class's code (for example
  every subject's "G1+G2" section), but only those they are enrolled in.
- Cancelling or shifting a lecture, or taking attendance, makes a RepRequest:
  - a GR's cancellation first needs a CR of the class to agree;
  - then, if every teacher of that subject lets CR/GR changes through without approval, it is
    applied at once and the teachers are asked "Did you know?"; otherwise a teacher must approve
    it, at least 15 minutes before the lecture.
- A teacher answering "I didn't know" undoes the change and takes that CR/GR's power over their
  lectures back until they give it again.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.academic.models import Section
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.governance import audit
from apps.identity.roles import coordinated_department_ids, is_institution_admin
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import ClassRep, RepBlock, RepRequest, TeacherRepSetting

#: A change that needs a teacher's approval must be approved this long before the lecture.
APPROVAL_LEAD = timedelta(minutes=15)

Stage = RepRequest.Stage
Action = RepRequest.Action


# Who is who ---------------------------------------------------------------------------------


def rep_role(user, section: Section) -> str | None:
    """'cr' or 'gr' when the person represents this section's class (and is in it), else None."""
    if getattr(user, "kind", None) != "student" or section.institution_id != user.institution_id:
        return None
    rep = ClassRep.objects.filter(
        student=user, term_id=section.offering.term_id, group_code=section.code
    ).first()
    if rep is None:
        return None
    enrolled = SectionEnrollment.objects.filter(
        student=user, section=section, status=SectionEnrollment.Status.ACTIVE
    ).exists()
    return rep.role if enrolled else None


def rep_sections(user) -> dict[int, str]:
    """Section id -> 'cr'/'gr' for every section the person may act on as a CR/GR."""
    reps = list(ClassRep.objects.filter(student=user).values_list("term_id", "group_code", "role"))
    if not reps:
        return {}
    by_class = {(t, g): r for t, g, r in reps}
    out = {}
    for sid, term_id, code in SectionEnrollment.objects.filter(
        student=user, status=SectionEnrollment.Status.ACTIVE
    ).values_list("section_id", "section__offering__term_id", "section__code"):
        role = by_class.get((term_id, code))
        if role:
            out[sid] = role
    return out


def teacher_ids(section: Section) -> set[int]:
    return set(
        TeacherAssignment.objects.filter(section=section).values_list("teacher_id", flat=True)
    )


def can_assign(user, section: Section) -> bool:
    """The section's teachers, its department's coordinators and institution admins."""
    if section.institution_id != user.institution_id:
        return False
    return (
        user.pk in teacher_ids(section)
        or is_institution_admin(user)
        or section.offering.course.department_id in coordinated_department_ids(user)
    )


def needs_approval(section: Section) -> bool:
    """Unless every teacher of the subject lets CR/GR changes through, a teacher must approve."""
    teachers = teacher_ids(section)
    if not teachers:
        return False
    trusting = set(TeacherRepSetting.objects.filter(
        teacher_id__in=teachers, without_approval=True
    ).values_list("teacher_id", flat=True))
    return trusting != teachers


def is_blocked(rep, section: Section) -> bool:
    return RepBlock.objects.filter(rep=rep, teacher_id__in=teacher_ids(section)).exists()


def lecture_start(meeting, day: date) -> datetime:
    tz = ZoneInfo(meeting.institution.timezone)
    return datetime.combine(day, meeting.starts_at, tzinfo=tz)


# Assigning CR and GR --------------------------------------------------------------------------


@transaction.atomic
def set_rep(user, section: Section, student, role: str | None) -> None:
    """Names a student of the section CR or GR of its class, or (role None) takes it away."""
    if not can_assign(user, section):
        raise PermissionDenied("Only this class's teachers and admins can choose its CR and GR.")
    if not SectionEnrollment.objects.filter(
        student=student, section=section, status=SectionEnrollment.Status.ACTIVE
    ).exists():
        raise ValidationError("That student isn't in this section.")
    key = {"student": student, "term_id": section.offering.term_id, "group_code": section.code}
    if role is None:
        ClassRep.objects.filter(**key).delete()
        audit.record(actor=user, action="classrep.removed", target=student,
                     changes={"class": section.code})
        return
    if role not in ClassRep.Role.values:
        raise ValidationError("Choose CR or GR.")
    ClassRep.objects.update_or_create(
        **key, defaults={"role": role, "institution_id": section.institution_id,
                         "assigned_by": user},
    )
    audit.record(actor=user, action="classrep.assigned", target=student,
                 changes={"class": section.code, "role": role})
    notify([student.pk], kind=Notification.Kind.CLASS_REP, institution_id=section.institution_id,
           title=f"You're the {role.upper()} of {section.code}",
           body="You can cancel or shift your class's lectures and take attendance. "
                "Teachers are told each time.",
           link="/timetable", actor_id=user.pk,
           dedupe_key=f"rep-role:{student.pk}:{section.offering.term_id}:{section.code}:{role}")


def reps_of(section: Section) -> dict[int, str]:
    """Student id -> role, for the section's class."""
    return dict(ClassRep.objects.filter(
        term_id=section.offering.term_id, group_code=section.code
    ).values_list("student_id", "role"))


# Teachers' choices ----------------------------------------------------------------------------


def without_approval(teacher) -> bool:
    s = TeacherRepSetting.objects.filter(teacher=teacher).first()
    return bool(s and s.without_approval)


def set_without_approval(teacher, value: bool) -> None:
    TeacherRepSetting.objects.update_or_create(teacher=teacher,
                                               defaults={"without_approval": value})
    audit.record(actor=teacher, action="classrep.setting", target=teacher,
                 changes={"without_approval": value})


def unblock(teacher, rep_id: int) -> None:
    RepBlock.objects.filter(teacher=teacher, rep_id=rep_id).delete()


# Requests -------------------------------------------------------------------------------------


def _label(req: RepRequest) -> str:
    course = req.section.offering.course
    at = f" at {req.meeting.starts_at:%H:%M}" if req.meeting_id else ""
    return f"{course.title} ({course.code}) on {req.date:%a %d %b}{at}"


def _reason(req: RepRequest) -> str:
    """The CR/GR's reason as a sentence of its own, or nothing."""
    if not req.note:
        return ""
    return " " + req.note.rstrip(".") + "."


def _what(req: RepRequest) -> str:
    if req.action == Action.CANCEL:
        return "cancel"
    if req.action == Action.SHIFT:
        starts = req.new_starts_at or req.meeting.starts_at
        return f"shift to {req.new_date:%a %d %b} at {starts:%H:%M}"
    return "take attendance for"


def _who(req: RepRequest) -> str:
    return f"{req.requester.get_full_name()} ({req.role.upper()} of {req.section.code})"


def _tell(user_ids, req: RepRequest, title: str, body: str, step: str) -> None:
    notify(user_ids, kind=Notification.Kind.CLASS_REP, institution_id=req.institution_id,
           title=title[:200], body=body[:300], link=f"/requests#request-{req.pk}",
           actor_id=None, dedupe_key=f"rep:{req.pk}:{step}")


def _validate_occurrence(meeting, day: date) -> None:
    term = meeting.section.offering.term
    if day.weekday() != meeting.weekday or not term.starts_on <= day <= term.ends_on:
        raise ValidationError("This class doesn't meet on that date.")


@transaction.atomic
def request_change(rep, *, meeting, day: date, action: str, new_date: date | None = None,
                   new_starts_at: time | None = None, new_ends_at: time | None = None,
                   note: str = "") -> RepRequest:
    """A CR/GR cancels or shifts one lecture. Returns the request; it may already be applied."""
    section = meeting.section
    role = rep_role(rep, section)
    if role is None:
        raise PermissionDenied("Only this class's CR or GR can do that.")
    if is_blocked(rep, section):
        raise PermissionDenied("This subject's teacher has taken back your CR/GR changes for "
                               "their lectures. Ask them to allow you again.")
    if action not in (Action.CANCEL, Action.SHIFT):
        raise ValidationError("Choose cancel or shift.")
    _validate_occurrence(meeting, day)
    start = lecture_start(meeting, day)
    if start <= timezone.now():
        raise ValidationError("This lecture has already started.")
    if action == Action.SHIFT:
        if new_date is None:
            raise ValidationError("Choose the new date.")
        starts = new_starts_at or meeting.starts_at
        ends = new_ends_at or meeting.ends_at
        if ends <= starts:
            raise ValidationError("The lecture has to end after it starts.")
        if new_date == day and starts == meeting.starts_at:
            raise ValidationError("Pick a different date or time.")
    if RepRequest.objects.filter(meeting=meeting, date=day,
                                 action__in=[Action.CANCEL, Action.SHIFT],
                                 stage__in=[Stage.CR_APPROVAL, Stage.TEACHER_APPROVAL]).exists():
        raise ValidationError("A request for this lecture is already waiting.")

    req = RepRequest.objects.create(
        institution_id=section.institution_id, requester=rep, role=role, meeting=meeting,
        section=section, date=day, action=action,
        new_date=new_date if action == Action.SHIFT else None,
        new_starts_at=new_starts_at if action == Action.SHIFT else None,
        new_ends_at=new_ends_at if action == Action.SHIFT else None,
        note=(note or "").strip()[:200], stage=Stage.TEACHER_APPROVAL,
    )
    audit.record(actor=rep, action="classrep.requested", target=req,
                 changes={"action": action, "date": day.isoformat()})

    crs = set(ClassRep.objects.filter(
        term_id=section.offering.term_id, group_code=section.code, role=ClassRep.Role.CR
    ).exclude(student=rep).values_list("student_id", flat=True))
    if role == ClassRep.Role.GR and action == Action.CANCEL and crs:
        req.stage = Stage.CR_APPROVAL
        req.save(update_fields=["stage", "updated_at"])
        _tell(crs, req, f"Approve? {req.requester.get_full_name()} (GR) wants to cancel a lecture",
              f"{_label(req)}. A GR's cancellation needs a CR's OK first.", "cr")
        return req
    _after_cr(req)
    return req


def _after_cr(req: RepRequest) -> None:
    """The teacher step: apply now (and ask "Did you know?") or wait for their approval."""
    if needs_approval(req.section):
        if timezone.now() > lecture_start(req.meeting, req.date) - APPROVAL_LEAD:
            raise ValidationError(
                "It's too late to ask the teacher: changes need their approval at least 15 "
                "minutes before the lecture.")
        req.stage = Stage.TEACHER_APPROVAL
        req.save(update_fields=["stage", "updated_at"])
        _tell(teacher_ids(req.section), req,
              f"Approve? {_who(req)} wants to {_what(req)} your lecture",
              f"{_label(req)}.{_reason(req)} Approve it at least 15 minutes "
              "before the lecture, or it lapses.", "ask")
    else:
        _apply(req)
        _tell(teacher_ids(req.section), req,
              f"Your lecture was {'cancelled' if req.action == Action.CANCEL else 'shifted'} "
              f"on {req.role.upper()} call",
              f"{_who(req)}: {_what(req)} {_label(req)}.{_reason(req)} "
              "Did you know about it?", "applied")


def _apply(req: RepRequest) -> None:
    from apps.scheduling.services import change_class

    note = f"{req.note} (on {req.role.upper()} call)".strip() if req.note else \
        f"On {req.role.upper()} call"
    change = change_class(
        req.requester, meeting=req.meeting, day=req.date,
        status="cancelled" if req.action == Action.CANCEL else "moved",
        new_date=req.new_date, new_starts_at=req.new_starts_at, new_ends_at=req.new_ends_at,
        note=note, notify=False, check=False,
    )
    req.change = change
    req.stage = Stage.APPLIED
    req.save(update_fields=["change", "stage", "updated_at"])


def rep_took_attendance(rep, section: Section, session) -> RepRequest | None:
    """Called after a CR/GR saves attendance: tell the teacher, or hold it for their approval."""
    role = rep_role(rep, section)
    if role is None:
        return None
    if is_blocked(rep, section):
        raise PermissionDenied("This subject's teacher has taken back your CR/GR rights for "
                               "their lectures.")
    req = RepRequest.objects.filter(attendance_session=session,
                                    action=Action.ATTENDANCE).first()
    if req is not None:
        return req  # edits to the same sheet don't ask again
    req = RepRequest.objects.create(
        institution_id=section.institution_id, requester=rep, role=role,
        meeting_id=session.meeting_id, section=section, date=session.date,
        action=Action.ATTENDANCE, attendance_session=session, stage=Stage.APPLIED,
    )
    if needs_approval(section):
        session.confirmed = False
        session.save(update_fields=["confirmed", "updated_at"])
        req.stage = Stage.TEACHER_APPROVAL
        req.save(update_fields=["stage", "updated_at"])
        _tell(teacher_ids(section), req, f"Approve? {_who(req)} took attendance",
              f"{_label(req)}. It counts once you approve it.", "ask")
    else:
        _tell(teacher_ids(section), req, f"Attendance taken on {role.upper()} call",
              f"{_who(req)} took attendance for {_label(req)}. Did you know about it?", "applied")
    return req


@transaction.atomic
def cr_decide(cr, req: RepRequest, approve: bool) -> RepRequest:
    if req.stage != Stage.CR_APPROVAL:
        raise ValidationError("This request isn't waiting for a CR.")
    if rep_role(cr, req.section) != ClassRep.Role.CR or cr.pk == req.requester_id:
        raise PermissionDenied("Only another CR of this class can decide.")
    if not approve:
        req.stage, req.decided_by, req.decided_at = Stage.DECLINED, cr, timezone.now()
        req.save(update_fields=["stage", "decided_by", "decided_at", "updated_at"])
        _tell([req.requester_id], req, "The CR said no to your cancellation", _label(req), "cr-no")
        return req
    req.approved_by_cr = cr
    req.save(update_fields=["approved_by_cr", "updated_at"])
    _after_cr(req)
    return req


@transaction.atomic
def teacher_decide(teacher, req: RepRequest, approve: bool) -> RepRequest:
    if req.stage != Stage.TEACHER_APPROVAL:
        raise ValidationError("This request isn't waiting for approval.")
    if teacher.pk not in teacher_ids(req.section):
        raise PermissionDenied("Only this subject's teacher can decide.")
    if req.action != Action.ATTENDANCE and \
            timezone.now() > lecture_start(req.meeting, req.date) - APPROVAL_LEAD:
        expire(req)
        raise ValidationError(
            "Too late: changes have to be approved 15 minutes before the lecture.")
    req.decided_by, req.decided_at = teacher, timezone.now()
    if not approve:
        req.stage = Stage.DECLINED
        req.save(update_fields=["stage", "decided_by", "decided_at", "updated_at"])
        if req.action == Action.ATTENDANCE and req.attendance_session_id:
            req.attendance_session.delete()
        _tell([req.requester_id], req, f"{teacher.get_full_name()} said no", _label(req), "no")
        return req
    req.save(update_fields=["decided_by", "decided_at", "updated_at"])
    if req.action == Action.ATTENDANCE:
        session = req.attendance_session
        if session is not None:
            session.confirmed = True
            session.save(update_fields=["confirmed", "updated_at"])
        req.stage = Stage.APPLIED
        req.save(update_fields=["stage", "updated_at"])
    else:
        _apply(req)
    _tell([req.requester_id], req, f"{teacher.get_full_name()} approved it", _label(req), "yes")
    return req


@transaction.atomic
def teacher_reply(teacher, req: RepRequest, known: bool) -> RepRequest:
    """After an automatic change: "I knew" keeps it; "I didn't know" undoes it and takes the
    CR/GR's power over this teacher's lectures back."""
    if req.stage != Stage.APPLIED or req.decided_by_id:
        raise ValidationError("There's nothing to answer on this one.")
    if teacher.pk not in teacher_ids(req.section):
        raise PermissionDenied("Only this subject's teacher can answer.")
    if req.teacher_reply:
        raise ValidationError("Already answered.")
    req.teacher_reply = "known" if known else "unknown"
    req.save(update_fields=["teacher_reply", "updated_at"])
    if known:
        return req
    if req.action == Action.ATTENDANCE:
        if req.attendance_session_id:
            req.attendance_session.delete()
    elif req.change_id:
        from apps.notifications.services import _section_people

        course = req.section.offering.course
        req.change.delete()
        req.change = None
        notify(_section_people(req.section_id), kind=Notification.Kind.CLASS_CHANGED,
               institution_id=req.institution_id,
               title=f"{course.title} on {req.date:%a %d %b} is back on",
               body=f"At {req.meeting.starts_at:%H:%M}, as normal. The teacher didn't agree "
                    "to the change.",
               link="/timetable", actor_id=teacher.pk, dedupe_key=f"rep:{req.pk}:restored")
    req.stage = Stage.UNDONE
    req.save(update_fields=["stage", "updated_at"])
    RepBlock.objects.get_or_create(teacher=teacher, rep_id=req.requester_id,
                                   defaults={"institution_id": req.institution_id})
    audit.record(actor=teacher, action="classrep.undone", target=req,
                 changes={"rep": req.requester_id})
    _tell([req.requester_id], req, f"{teacher.get_full_name()} undid your change",
          f"{_label(req)}. They didn't know about it, so you can't change their lectures until "
          "they allow you again.", "undone")
    return req


def expire(req: RepRequest) -> None:
    req.stage = Stage.EXPIRED
    req.save(update_fields=["stage", "updated_at"])
    _tell([req.requester_id], req, "Your request lapsed",
          f"{_label(req)}. It wasn't approved 15 minutes before the lecture.", "expired")


def expire_overdue() -> int:
    """Cancel/shift requests still waiting 15 minutes before their lecture lapse (cron)."""
    count = 0
    for req in RepRequest.objects.filter(
        stage__in=[Stage.CR_APPROVAL, Stage.TEACHER_APPROVAL],
        action__in=[Action.CANCEL, Action.SHIFT],
        date__lte=timezone.now().date() + timedelta(days=1),
    ).select_related("meeting__institution", "section__offering__course", "requester"):
        if timezone.now() > lecture_start(req.meeting, req.date) - APPROVAL_LEAD:
            expire(req)
            count += 1
    return count


def visible_requests(user):
    """Teachers: their subjects'. CR/GR: their own, plus GR cancellations a CR can decide."""
    qs = RepRequest.objects.filter(institution_id=user.institution_id).select_related(
        "requester", "meeting", "section__offering__course", "decided_by")
    taught = TeacherAssignment.objects.filter(teacher=user).values_list("section_id", flat=True)
    cr_sections = [sid for sid, role in rep_sections(user).items() if role == ClassRep.Role.CR]
    from django.db.models import Q

    return qs.filter(
        Q(section_id__in=list(taught)) | Q(requester=user)
        | Q(section_id__in=cr_sections, stage=Stage.CR_APPROVAL)
    )[:100]
