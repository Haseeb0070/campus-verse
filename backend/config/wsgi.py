import os

from django.conf import settings
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()

# The API's own timer for reminders and other timed jobs (apps.core.ticker). On by default in
# production without Redis (where Celery's scheduler would do it); off for local development.
if settings.CAMPUSVERSE_IN_PROCESS_JOBS:
    from apps.core.ticker import start

    start()
