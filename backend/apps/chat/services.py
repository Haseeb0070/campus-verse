import logging
import uuid
from dataclasses import dataclass

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.academic.models import Section
from apps.core import realtime
from apps.enrollment.models import TeacherAssignment
from apps.governance import audit
from apps.scheduling.services import member_section_ids

from .models import Conversation, ConversationMember, Message

logger = logging.getLogger(__name__)

MAX_BODY = 4000


@dataclass
class ConversationSummary:
    conversation: Conversation
    section: Section | None
    unread: int
    last_message: Message | None
    is_moderator: bool


def can_access(user, conversation: Conversation) -> bool:
    if not user.is_authenticated or conversation.institution_id != user.institution_id:
        return False
    if conversation.kind == Conversation.Kind.SECTION:
        return conversation.section_id in member_section_ids(user)
    return conversation.members.filter(user=user).exists()


def is_moderator(user, conversation: Conversation) -> bool:
    """Teachers moderate their sections' chats."""
    if conversation.kind != Conversation.Kind.SECTION:
        return False
    return TeacherAssignment.objects.filter(
        teacher=user, section_id=conversation.section_id
    ).exists()


def teacher_ids(conversation: Conversation) -> set[int]:
    if conversation.kind != Conversation.Kind.SECTION:
        return set()
    return set(
        TeacherAssignment.objects.filter(section_id=conversation.section_id).values_list(
            "teacher_id", flat=True
        )
    )


def get_conversation_for(user, conversation_id: int) -> Conversation:
    conversation = (
        Conversation.objects.select_related("section__offering__course")
        .filter(pk=conversation_id)
        .first()
    )
    # Same answer for "doesn't exist" and "not yours": never reveal that a chat exists.
    if conversation is None or not can_access(user, conversation):
        raise Conversation.DoesNotExist
    return conversation


def ensure_section_conversations(user) -> None:
    sections = Section.objects.filter(
        pk__in=member_section_ids(user), conversation__isnull=True
    ).select_related("offering__course")
    for section in sections:
        Conversation.objects.get_or_create(
            section=section,
            defaults={
                "institution_id": section.institution_id,
                "kind": Conversation.Kind.SECTION,
                "title": f"{section.offering.course.code} · {section.code}",
            },
        )


def conversations_for(user) -> list[ConversationSummary]:
    if user.institution_id is None:
        return []
    ensure_section_conversations(user)
    conversations = list(
        Conversation.objects.filter(
            Q(kind=Conversation.Kind.SECTION, section_id__in=member_section_ids(user))
            | Q(members__user=user),
            institution_id=user.institution_id,
        )
        .select_related("section__offering__course")
        .distinct()
    )
    read_marks = dict(
        ConversationMember.objects.filter(user=user, conversation__in=conversations).values_list(
            "conversation_id", "last_read_message_id"
        )
    )
    moderated = set(
        TeacherAssignment.objects.filter(teacher=user).values_list("section_id", flat=True)
    )
    summaries = []
    for conv in conversations:
        last = (
            Message.objects.filter(conversation=conv)
            .select_related("sender")
            .order_by("-id")
            .first()
        )
        unread = (
            Message.objects.filter(
                conversation=conv, id__gt=read_marks.get(conv.pk, 0), deleted_at__isnull=True
            )
            .exclude(sender=user)
            .aggregate(n=Count("id"))["n"]
        )
        summaries.append(
            ConversationSummary(
                conversation=conv,
                section=conv.section,
                unread=unread,
                last_message=last,
                is_moderator=conv.section_id in moderated,
            )
        )
    summaries.sort(
        key=lambda s: (s.conversation.last_message_at or s.conversation.created_at), reverse=True
    )
    return summaries


def list_messages(conversation: Conversation, *, before_id: int | None = None, limit: int = 50):
    """Newest `limit` messages (older than `before_id` if given), returned oldest first."""
    limit = max(1, min(limit, 100))
    qs = Message.objects.filter(conversation=conversation).select_related("sender")
    if before_id:
        qs = qs.filter(id__lt=before_id)
    page = list(qs.order_by("-id")[: limit + 1])
    has_more = len(page) > limit
    return list(reversed(page[:limit])), has_more


def mark_read(user, conversation: Conversation, message_id: int) -> None:
    member, _ = ConversationMember.objects.get_or_create(
        conversation=conversation,
        user=user,
        defaults={"institution_id": conversation.institution_id},
    )
    if message_id > member.last_read_message_id:
        member.last_read_message_id = message_id
        member.save(update_fields=["last_read_message_id", "updated_at"])


def _publish(channel: str, data: dict) -> None:
    """Deliver after commit. Delivery failure never loses the message: it's already stored,
    and clients catch up from the API."""

    def send():
        try:
            realtime.publish(channel, data)
        except Exception:  # noqa: BLE001 - delivery is best-effort by design
            logger.warning("Realtime publish to %s failed", channel, exc_info=True)

    transaction.on_commit(send)


def send_message(user, conversation: Conversation, *, body: str, client_id: uuid.UUID):
    from .serializers import message_payload  # avoid a cycle with the API schemas

    if not can_access(user, conversation):
        raise PermissionDenied("You're not in this conversation.")
    body = (body or "").strip()
    if not body:
        raise ValidationError("Write a message first.")
    if len(body) > MAX_BODY:
        raise ValidationError(f"Messages can be up to {MAX_BODY} characters.")

    existing = Message.objects.filter(
        conversation=conversation, sender=user, client_id=client_id
    ).first()
    if existing is not None:
        return existing, False

    try:
        with transaction.atomic():
            message = Message.objects.create(
                institution_id=conversation.institution_id,
                conversation=conversation,
                sender=user,
                client_id=client_id,
                body=body,
            )
            Conversation.objects.filter(pk=conversation.pk).update(
                last_message_at=message.created_at
            )
            mark_read(user, conversation, message.pk)
    except IntegrityError:
        # A concurrent retry with the same client_id won the race.
        winner = Message.objects.get(conversation=conversation, sender=user, client_id=client_id)
        return winner, False

    _publish(
        conversation.channel,
        {"type": "message.created", "message": message_payload(message, teacher_ids(conversation))},
    )
    return message, True


def delete_message(user, message: Message) -> Message:
    conversation = message.conversation
    if not can_access(user, conversation):
        raise PermissionDenied("You're not in this conversation.")
    own = message.sender_id == user.pk
    if not own and not is_moderator(user, conversation):
        raise PermissionDenied("You can only delete your own messages.")
    if message.deleted_at is None:
        message.deleted_at = timezone.now()
        message.deleted_by = user
        message.save(update_fields=["deleted_at", "deleted_by", "updated_at"])
        if not own:
            # Moderation is auditable; the message text itself is not copied into the log.
            audit.record(
                actor=user,
                action="chat.message_removed",
                target=message,
                changes={"conversation": conversation.pk, "sender": message.sender_id},
            )
        _publish(conversation.channel, {"type": "message.deleted", "id": message.pk})
    return message
