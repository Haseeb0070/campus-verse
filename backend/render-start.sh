#!/usr/bin/env bash
# Starts the CampusVerse API on Render (see render.yaml at the repository root).
#
# Free Render services have no separate pre-deploy step or background-worker plan, so this one
# service does all three jobs: update the database, run the Celery worker with its scheduler
# (scheduled notices, reminders, sync), and serve the API with Gunicorn.
set -euo pipefail

cd "$(dirname "$0")"
PY=.venv/bin/python

$PY manage.py migrate --noinput

# A test deployment sets up Govt. Graduate College of Science once (it replaces any demo data on
# its first run and does nothing after that). It needs SEED_PASSWORD for the accounts it creates.
if [ "${DEMO_SEED:-false}" = "true" ]; then
  $PY manage.py seed_college || echo "seed_college failed; see the message above."
fi

# Says in the log where uploads go (R2 once R2_BUCKET is set) and whether that works.
$PY manage.py check_uploads || true

# Worker and scheduler in one small process. Without REDIS_URL, tasks run inline instead.
if [ -n "${REDIS_URL:-}" ]; then
  .venv/bin/celery -A config worker --beat --pool=solo --loglevel=INFO &
fi

exec .venv/bin/gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-10000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 60 \
  --access-logfile -
