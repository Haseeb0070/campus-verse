from datetime import date, datetime, time

from django.core.exceptions import PermissionDenied, ValidationError
from ninja import Router, Schema, Status
from ninja.errors import HttpError

from apps.academic.models import Section
from apps.identity.models import User
from apps.scheduling.models import ClassMeeting

from . import services
from .models import RepBlock, RepRequest

router = Router(tags=["class reps"])


class ErrorOut(Schema):
    detail: str


class RequestOut(Schema):
    id: int
    action: str
    stage: str
    role: str
    requester: str
    requester_id: int
    course_code: str
    course_title: str
    section_code: str
    date: date
    starts_at: time | None
    new_date: date | None
    new_starts_at: time | None
    new_ends_at: time | None
    note: str
    created_at: datetime
    teacher_reply: str
    decided_by: str
    #: What this person can do with it: "decide" (approve/decline) or "reply" (knew / didn't).
    can_decide: bool
    can_reply: bool


def _out(req: RepRequest, user) -> dict:
    course = req.section.offering.course
    teaching = user.pk in services.teacher_ids(req.section)
    return {
        "id": req.pk, "action": req.action, "stage": req.stage, "role": req.role,
        "requester": req.requester.get_full_name(), "requester_id": req.requester_id,
        "course_code": course.code, "course_title": course.title,
        "section_code": req.section.code, "date": req.date,
        "starts_at": req.meeting.starts_at if req.meeting_id else None,
        "new_date": req.new_date, "new_starts_at": req.new_starts_at,
        "new_ends_at": req.new_ends_at, "note": req.note, "created_at": req.created_at,
        "teacher_reply": req.teacher_reply,
        "decided_by": req.decided_by.get_full_name() if req.decided_by_id else "",
        "can_decide": (teaching and req.stage == RepRequest.Stage.TEACHER_APPROVAL) or (
            req.stage == RepRequest.Stage.CR_APPROVAL and req.requester_id != user.pk
            and services.rep_role(user, req.section) == "cr"),
        "can_reply": teaching and req.stage == RepRequest.Stage.APPLIED
        and not req.decided_by_id and not req.teacher_reply,
    }


def _call(fn):
    try:
        return fn()
    except PermissionDenied as err:
        raise HttpError(403, str(err)) from None
    except ValidationError as err:
        raise HttpError(422, err.messages[0]) from None


def _req(request, request_id: int) -> RepRequest:
    req = next((r for r in services.visible_requests(request.user) if r.pk == request_id), None)
    if req is None:
        raise HttpError(404, "Request not found")
    return req


class MineOut(Schema):
    sections: dict[int, str]  # section id -> "cr" / "gr"
    without_approval: bool
    blocked: list[dict]


@router.get("/mine", response=MineOut)
def mine(request):
    """Where the person is CR/GR; for teachers, their approval setting and who they blocked."""
    blocks = RepBlock.objects.filter(teacher=request.user).select_related("rep")
    return {
        "sections": services.rep_sections(request.user),
        "without_approval": services.without_approval(request.user),
        "blocked": [{"id": b.rep_id, "name": b.rep.get_full_name()} for b in blocks],
    }


class SettingIn(Schema):
    without_approval: bool


@router.put("/settings", response=MineOut)
def settings(request, payload: SettingIn):
    if request.user.kind == "student":
        raise HttpError(403, "This is a teacher's setting.")
    services.set_without_approval(request.user, payload.without_approval)
    return mine(request)


@router.delete("/blocks/{rep_id}", response=MineOut)
def unblock(request, rep_id: int):
    services.unblock(request.user, rep_id)
    return mine(request)


@router.get("/requests", response=list[RequestOut])
def requests(request):
    services.expire_overdue()
    return [_out(r, request.user) for r in services.visible_requests(request.user)]


class ChangeIn(Schema):
    meeting_id: int
    date: date
    action: str  # cancel / shift
    new_date: date | None = None
    new_starts_at: time | None = None
    new_ends_at: time | None = None
    note: str = ""


@router.post("/requests", response={201: RequestOut, 403: ErrorOut, 422: ErrorOut})
def create(request, payload: ChangeIn):
    meeting = ClassMeeting.objects.filter(
        pk=payload.meeting_id, institution_id=request.user.institution_id
    ).select_related("section__offering__term", "institution").first()
    if meeting is None:
        raise HttpError(404, "Class not found")
    req = _call(lambda: services.request_change(
        request.user, meeting=meeting, day=payload.date, action=payload.action,
        new_date=payload.new_date, new_starts_at=payload.new_starts_at,
        new_ends_at=payload.new_ends_at, note=payload.note))
    return Status(201, _out(req, request.user))


class DecideIn(Schema):
    approve: bool


@router.post("/requests/{request_id}/decide", response={200: RequestOut, 403: ErrorOut,
                                                       422: ErrorOut})
def decide(request, request_id: int, payload: DecideIn):
    req = _req(request, request_id)
    if req.stage == RepRequest.Stage.CR_APPROVAL:
        _call(lambda: services.cr_decide(request.user, req, payload.approve))
    else:
        _call(lambda: services.teacher_decide(request.user, req, payload.approve))
    req.refresh_from_db()
    return _out(req, request.user)


class ReplyIn(Schema):
    known: bool


@router.post("/requests/{request_id}/reply", response={200: RequestOut, 403: ErrorOut,
                                                      422: ErrorOut})
def reply(request, request_id: int, payload: ReplyIn):
    req = _req(request, request_id)
    _call(lambda: services.teacher_reply(request.user, req, payload.known))
    req.refresh_from_db()
    return _out(req, request.user)


class RepOut(Schema):
    student_id: int
    role: str


@router.get("/sections/{section_id}", response={200: list[RepOut], 403: ErrorOut})
def section_reps(request, section_id: int):
    section = Section.objects.filter(pk=section_id,
                                     institution_id=request.user.institution_id).first()
    if section is None or not services.can_assign(request.user, section):
        raise HttpError(403, "Only this class's teachers and admins can see its CR and GR.")
    return [{"student_id": k, "role": v} for k, v in services.reps_of(section).items()]


class AssignIn(Schema):
    student_id: int
    role: str | None  # "cr", "gr", or null to take it away


@router.put("/sections/{section_id}", response={200: list[RepOut], 403: ErrorOut,
                                                 422: ErrorOut})
def assign(request, section_id: int, payload: AssignIn):
    section = Section.objects.filter(pk=section_id,
                                     institution_id=request.user.institution_id).first()
    student = User.objects.filter(pk=payload.student_id,
                                  institution_id=request.user.institution_id).first()
    if section is None or student is None:
        raise HttpError(404, "Not found")
    _call(lambda: services.set_rep(request.user, section, student, payload.role))
    return section_reps(request, section_id)
