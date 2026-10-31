import uuid
from datetime import datetime

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from ninja import Router, Schema, Status
from ninja.errors import HttpError

from apps.core import realtime

from . import services
from .models import Conversation, Message
from .serializers import message_payload

router = Router(tags=["chat"])


class SenderOut(Schema):
    id: int
    name: str
    initials: str
    is_teacher: bool


class MessageOut(Schema):
    id: int
    conversation_id: int
    client_id: str
    body: str
    deleted: bool
    created_at: datetime
    sender: SenderOut


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


def _summary_out(s: services.ConversationSummary, user) -> dict:
    conv = s.conversation
    course = conv.section.offering.course if conv.section else None
    teachers = services.teacher_ids(conv)
    return {
        "id": conv.pk,
        "kind": conv.kind,
        "section_id": conv.section_id,
        "title": conv.title,
        "course_title": course.title if course else None,
        "section_code": conv.section.code if conv.section else None,
        "color": course.color if course else None,
        "unread": s.unread,
        "is_moderator": s.is_moderator,
        "last_message": message_payload(s.last_message, teachers) if s.last_message else None,
        "last_message_at": conv.last_message_at,
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
