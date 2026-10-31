from .models import Message


def initials(user) -> str:
    first = user.preferred_name or user.first_name
    letters = f"{first[:1]}{user.last_name[:1]}" or user.email[:1]
    return letters.upper()


def message_payload(message: Message, teachers: set[int]) -> dict:
    """The one shape a message has, in API responses and realtime events alike."""
    deleted = message.deleted_at is not None
    sender = message.sender
    return {
        "id": message.pk,
        "conversation_id": message.conversation_id,
        "client_id": str(message.client_id),
        "body": "" if deleted else message.body,
        "deleted": deleted,
        "created_at": message.created_at.isoformat(),
        "attachments": [] if deleted else [
            {"id": f.pk, "name": f.original_name, "size": f.size, "content_type": f.content_type}
            for f in message.attachments.all()
        ],
        "sender": {
            "id": sender.pk,
            "name": sender.get_full_name() or sender.email,
            "initials": initials(sender),
            "is_teacher": sender.pk in teachers,
        },
    }
