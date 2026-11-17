import uuid
from datetime import datetime

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.http import FileResponse
from ninja import File, Form, Router, Schema, Status
from ninja.errors import HttpError
from ninja.files import UploadedFile

from apps.core import realtime
from apps.identity.models import User

from . import services
from .models import Conversation, ConversationMember, Message
from .serializers import initials, message_payload

router = Router(tags=["chat"])


class SenderOut(Schema):
    id: int
    name: str
    initials: str
    is_teacher: bool


class AttachmentOut(Schema):
    id: int
    name: str
    size: int
    content_type: str


class MessageOut(Schema):
    id: int
    conversation_id: int
    client_id: str
    body: str
    deleted: bool
    created_at: datetime
    sender: SenderOut
    attachments: list[AttachmentOut] = []


class PersonOut(Schema):
    id: int
    name: str
    initials: str
    kind: str
    detail: str = ""


class DirectIn(Schema):
    user_id: int


class MuteIn(Schema):
    muted: bool


class ConversationOut(Schema):
    id: int
    kind: str
    section_id: int | None
    title: str
    course_title: str | None
    section_code: str | None
    color: str | None
    unread: int
    is_moderator: bool
    last_message: MessageOut | None
    last_message_at: datetime | None
    other: PersonOut | None = None
    muted: bool = False
    # One-to-one chats: "pending" until the other person accepts, then "accepted" (or "declined").
    request_status: str = "accepted"
    requested_by_me: bool = False


class MessagePage(Schema):
    messages: list[MessageOut]
    has_more: bool


class SendIn(Schema):
    body: str
    client_id: uuid.UUID


class ReadIn(Schema):
    message_id: int


class RealtimeConnectOut(Schema):
    enabled: bool
    url: str
    token: str


class ChannelTokensOut(Schema):
    channel: str
    token: str
    typing_channel: str
    typing_token: str


def _conversation(request, conversation_id: int) -> Conversation:
    try:
        return services.get_conversation_for(request.user, conversation_id)
    except Conversation.DoesNotExist:
        raise HttpError(404, "Conversation not found") from None


def _person(u: User) -> dict:
    return {"id": u.pk, "name": u.get_full_name() or u.email, "initials": initials(u),
            "kind": u.kind, "detail": u.get_kind_display()}


def _summary_out(s: services.ConversationSummary, user) -> dict:
    conv = s.conversation
    course = conv.section.offering.course if conv.section else None
    teachers = services.teacher_ids(conv)
    other = services.other_member(user, conv)
    return {
        "id": conv.pk,
        "kind": conv.kind,
        "section_id": conv.section_id,
        "title": (other.get_full_name() or other.email) if other else conv.title,
        "other": _person(other) if other else None,
        "muted": ConversationMember.objects.filter(
            conversation=conv, user=user, muted=True
        ).exists(),
        "course_title": course.title if course else None,
        "section_code": conv.section.code if conv.section else None,
        "color": course.color if course else None,
        "unread": s.unread,
        "is_moderator": s.is_moderator,
        "last_message": message_payload(s.last_message, teachers) if s.last_message else None,
        "last_message_at": conv.last_message_at,
        "request_status": conv.request_status,
        "requested_by_me": conv.requested_by_id == user.pk,
    }


@router.get("/conversations", response=list[ConversationOut])
def list_conversations(request):
    return [_summary_out(s, request.user) for s in services.conversations_for(request.user)]


@router.get("/conversations/{conversation_id}", response=ConversationOut)
def get_conversation(request, conversation_id: int):
    conv = _conversation(request, conversation_id)
    for summary in services.conversations_for(request.user):
        if summary.conversation.pk == conv.pk:
            return _summary_out(summary, request.user)
    raise HttpError(404, "Conversation not found")


@router.get("/conversations/{conversation_id}/messages", response=MessagePage)
def list_messages(request, conversation_id: int, before: int | None = None, limit: int = 50):
    conv = _conversation(request, conversation_id)
    messages, has_more = services.list_messages(conv, before_id=before, limit=limit)
    teachers = services.teacher_ids(conv)
    return {"messages": [message_payload(m, teachers) for m in messages], "has_more": has_more}


@router.post(
    "/conversations/{conversation_id}/messages", response={200: MessageOut, 201: MessageOut}
)
def send_message(request, conversation_id: int, payload: SendIn):
    conv = _conversation(request, conversation_id)
    try:
        message, created = services.send_message(
            request.user, conv, body=payload.body, client_id=payload.client_id
        )
    except ValidationError as err:
        raise HttpError(422, err.messages[0]) from None
    except PermissionDenied as err:
        raise HttpError(403, str(err)) from None
    # 200 for a retried send that was already stored, so clients can tell it apart.
    return Status(201 if created else 200, message_payload(message, services.teacher_ids(conv)))


@router.post(
    "/conversations/{conversation_id}/attachments", response={200: MessageOut, 201: MessageOut}
)
def send_with_files(
    request,
    conversation_id: int,
    client_id: Form[uuid.UUID],
    body: Form[str] = "",
    files: File[list[UploadedFile]] = None,
):
    """The same as sending a message, with files (multipart)."""
    conv = _conversation(request, conversation_id)
    try:
        message, created = services.send_message(
            request.user, conv, body=body, client_id=client_id, uploads=files or []
        )
    except ValidationError as err:
        raise HttpError(422, err.messages[0]) from None
    except PermissionDenied as err:
        raise HttpError(403, str(err)) from None
    return Status(201 if created else 200, message_payload(message, services.teacher_ids(conv)))


@router.get("/people", response=list[PersonOut])
def people(request, q: str = ""):
    """Who you can start a one-to-one chat with."""
    return [_person(u) for u in services.contacts(request.user, q)]


@router.post("/direct", response={200: ConversationOut, 403: dict})
def start_direct(request, payload: DirectIn):
    other = User.objects.filter(pk=payload.user_id).first()
    try:
        conv = services.start_direct(request.user, other)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    return Status(200, get_conversation(request, conv.pk))


@router.post("/conversations/{conversation_id}/request/{answer}", response=ConversationOut)
def answer_request(request, conversation_id: int, answer: str):
    """Accept or decline a message request sent to you (answer: "accept" or "decline")."""
    if answer not in ("accept", "decline"):
        raise HttpError(404, "Not found")
    conv = _conversation(request, conversation_id)
    try:
        services.answer_request(request.user, conv, accept=answer == "accept")
    except PermissionDenied as err:
        raise HttpError(403, str(err)) from None
    return get_conversation(request, conv.pk)


@router.post("/conversations/{conversation_id}/mute", response={204: None})
def mute(request, conversation_id: int, payload: MuteIn):
    services.set_muted(request.user, _conversation(request, conversation_id), payload.muted)
    return Status(204, None)


@router.get("/files/{file_id}", response={200: None})
def download(request, file_id: int):
    stored = services.downloadable_attachment(request.user, file_id)
    # Same 404 whether it doesn't exist or isn't yours (SRS 9.2).
    if stored is None:
        raise HttpError(404, "File not found")
    response = FileResponse(stored.file.open("rb"),
                            as_attachment=not stored.content_type.startswith("image/"),
                            filename=stored.original_name, content_type=stored.content_type)
    response["Cache-Control"] = "private, max-age=3600"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@router.post("/conversations/{conversation_id}/read", response={204: None})
def mark_read(request, conversation_id: int, payload: ReadIn):
    conv = _conversation(request, conversation_id)
    services.mark_read(request.user, conv, payload.message_id)
    return Status(204, None)


@router.delete("/messages/{message_id}", response={204: None})
def delete_message(request, message_id: int):
    message = Message.objects.select_related("conversation").filter(pk=message_id).first()
    if message is None or not services.can_access(request.user, message.conversation):
        raise HttpError(404, "Message not found")
    try:
        services.delete_message(request.user, message)
    except PermissionDenied as err:
        raise HttpError(403, str(err)) from None
    return Status(204, None)


@router.get("/realtime", response=RealtimeConnectOut)
def realtime_connection(request):
    if not settings.CENTRIFUGO_TOKEN_SECRET:
        return {"enabled": False, "url": "", "token": ""}
    return {
        "enabled": True,
        "url": settings.CENTRIFUGO_WS_URL,
        "token": realtime.connection_token(request.user),
    }


@router.get("/conversations/{conversation_id}/realtime", response=ChannelTokensOut)
def realtime_channels(request, conversation_id: int):
    conv = _conversation(request, conversation_id)  # access check before any token
    return {
        "channel": conv.channel,
        "token": realtime.subscription_token(request.user, conv.channel),
        "typing_channel": conv.typing_channel,
        "typing_token": realtime.subscription_token(request.user, conv.typing_channel),
    }
