"""The API's own timer: runs the timed jobs while the server is up, without an outside caller.

On the free Render plan the API sleeps when nobody uses it, and Render often refuses requests
from timer services (cron-job.org) instead of waking it. So the jobs that matter during the day
(lecture reminders, CR/GR requests lapsing 15 minutes before a lecture, scheduled notices) run
here, every minute, whenever the API is awake. An outside timer is only a backup.

Every Gunicorn worker starts one thread; a lock in the shared cache (the database table, when
there's no Redis) makes sure only one of them runs the jobs each minute.
"""

import logging
import threading
import time

from django.core.cache import cache
from django.db import close_old_connections

logger = logging.getLogger(__name__)

EVERY_MINUTE = 60
EVERY_HALF_HOUR = 30 * 60

_started = False


def _frequent():
    from apps.classreps.services import expire_overdue
    from apps.scheduling.reminders import send_lecture_reminders

    return {"reminders": send_lecture_reminders(), "requests_lapsed": expire_overdue()}


def _half_hourly():
    from apps.notices.tasks import publish_due
    from apps.notifications.tasks import send_scheduled

    return {"notices_published": publish_due(), "notifications": send_scheduled()}


def tick() -> dict:
    """One round: the frequent jobs if no other worker ran them this minute, the half-hourly
    ones if none ran them this half hour. Returns what ran (empty when another worker had it)."""
    done: dict = {}
    for key, every, job in (("ticker:minute", EVERY_MINUTE, _frequent),
                            ("ticker:half-hour", EVERY_HALF_HOUR, _half_hourly)):
        # add() only succeeds for the first worker; the key expires before the next round.
        if not cache.add(key, 1, timeout=every - 5):
            continue
        try:
            done.update(job())
        except Exception:
            logger.exception("In-process job %s failed", key)
    return done


def _loop():
    while True:
        try:
            close_old_connections()
            tick()
        except Exception:  # never let the thread die
            logger.exception("In-process timer round failed")
        finally:
            close_old_connections()
        time.sleep(EVERY_MINUTE)


def start() -> None:
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_loop, name="campusverse-ticker", daemon=True).start()
