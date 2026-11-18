"""Email copies of notifications for people who asked for them (SRS 5.9). Each notification is
emailed at most once: it's claimed by setting emailed_at before sending, and released again if
the send fails so a retry can pick it up."""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone
from django.utils.html import escape

from .models import Notification

logger = logging.getLogger(__name__)


def _message(n: Notification) -> EmailMultiAlternatives:
    base = settings.FRONTEND_URL.rstrip("/")
    link = f"{base}{n.link}" if n.link else base
    prefs = f"{base}/profile#notifications"
    text = "\n\n".join(filter(None, [
        n.body,
        f"Open in CampusVerse: {link}",
        f"You get this email because of your notification settings. Change them: {prefs}",
    ]))
    html = (
        '<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;'
        'line-height:1.5;color:#111318;max-width:520px">'
        f'<p style="font-size:17px;font-weight:600;margin:0 0 8px">{escape(n.title)}</p>'
        + (f'<p style="margin:0 0 16px">{escape(n.body)}</p>' if n.body else "")
        + f'<p style="margin:0 0 24px"><a href="{escape(link)}" style="display:inline-block;'
        'background:#335cff;color:#fff;text-decoration:none;padding:10px 18px;'
        'border-radius:999px;font-weight:600">Open in CampusVerse</a></p>'
        '<p style="font-size:12px;color:#5f6474;margin:0">You get this email because of your '
        f'notification settings. <a href="{escape(prefs)}" style="color:#2747d6">Change them</a>.'
        "</p></div>"
    )
    msg = EmailMultiAlternatives(subject=n.title, body=text, to=[n.recipient.email])
    msg.attach_alternative(html, "text/html")
    return msg


def send_for(dedupe_key: str, user_ids: list[int]) -> int:
    pending = Notification.objects.filter(
        dedupe_key=dedupe_key, recipient_id__in=user_ids, email_wanted=True,
        emailed_at__isnull=True, recipient__is_active=True,
    ).select_related("recipient")
    sent = 0
    # One connection for the whole batch: a notice to the whole college is one SMTP session,
    # not one per person.
    connection = get_connection()
    for n in pending:
        if not n.recipient.email:
            continue
        # Claim it first, so a concurrent retry can't send a second copy.
        if not Notification.objects.filter(pk=n.pk, emailed_at__isnull=True).update(
            emailed_at=timezone.now()
        ):
            continue
        try:
            msg = _message(n)
            msg.connection = connection
            msg.send()
            sent += 1
        except Exception:
            Notification.objects.filter(pk=n.pk).update(emailed_at=None)
            logger.warning("Emailing notification %s failed", n.pk, exc_info=True)
            raise  # the task retries; the in-app record is untouched either way
    return sent


def send_leftovers(limit: int = 300) -> int:
    """Emails that were wanted but never sent (a background send that died): for the cron job."""
    from datetime import timedelta

    stale = timezone.now() - timedelta(minutes=2)
    keys = (
        Notification.objects.filter(
            email_wanted=True, emailed_at__isnull=True, created_at__lt=stale,
            recipient__is_active=True,
        )
        .values_list("dedupe_key", "recipient_id")[:limit]
    )
    by_key: dict[str, list[int]] = {}
    for key, uid in keys:
        by_key.setdefault(key, []).append(uid)
    sent = 0
    for key, uids in by_key.items():
        try:
            sent += send_for(key, uids)
        except Exception:  # noqa: BLE001 - the next run tries again
            logger.warning("Sending leftover emails for %s failed", key, exc_info=True)
    return sent
