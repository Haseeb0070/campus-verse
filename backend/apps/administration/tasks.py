from celery import shared_task

from . import sources


@shared_task
def run_due_sources() -> int:
    """Celery beat runs this every 15 minutes; each source runs on its own schedule."""
    ran = 0
    for source in sources.due_sources():
        sources.run_source(source)
        ran += 1
    return ran
