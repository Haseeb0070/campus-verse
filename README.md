# CampusVerse

A smart academic network: classes, notices, live section chat, coursework and controlled
data sync for students, teachers and administrators.

| Part | Stack |
|---|---|
| `backend/` | Django 5.2, Django Ninja API, django-allauth (headless), Celery |
| `web/` | Next.js 15, React 19, Tailwind CSS v4, CampusVerse Glass tokens |
| `infra/` | Docker Compose: PostgreSQL 17, Redis, Centrifugo v6, Mailpit |
| `docs/` | Architecture decisions |

Design reference: the canvas "CampusVerse Design Concept" and [`SKILL.md`](SKILL.md)
(Apple-style motion and materials, adapted for the web).

## Requirements

- [uv](https://docs.astral.sh/uv/) (installs Python 3.13 for you)
- Node.js 22 LTS (Tailwind CSS v4 needs Node 20 or newer)
- Docker Desktop, for Postgres, Redis and Centrifugo. The backend also runs on SQLite
  without Docker, which is enough for the tests.

## Run it

Start the services (optional without Docker):

```bash
cd infra
docker compose up -d
```

Backend, on http://localhost:8000 (API docs at `/api/docs`, admin at `/admin/`):

```bash
cd backend
cp .env.example .env
uv sync
uv run python manage.py migrate
uv run python manage.py seed_demo
uv run python manage.py createsuperuser
uv run python manage.py runserver
```

`seed_demo` (development only) creates Demo University with courses, sections, a weekly
timetable including a moved class and a room change, notices, assignments, feed posts and
course resources and calendar events. Demo accounts, all with the password `campusverse-demo`:

| Email | Who |
|---|---|
| `ayesha@demo.campusverse.test` | Student in CS-301 · 3B, MATH-210, ENG-105, PHY-150 |
| `hamza@demo.campusverse.test` | Student in CS-301 · 3B, MATH-210 |
| `sara@demo.campusverse.test` | Student in CS-301 · 3C, ENG-105 |
| `imran@demo.campusverse.test` | Teacher of CS-301 · 3B, 3C and CS-110 · 1A |
| `nadia@demo.campusverse.test` | Institution admin |

Web app, on http://localhost:3000 (it proxies `/api` and `/_allauth` to Django). If Django
runs on another port, copy `web/.env.example` to `web/.env.local` and change the URLs:

```bash
cd web
npm install
npm run dev
```

Live chat needs Centrifugo on port 8001. Docker Compose starts it; without Docker, download
the Windows build from the [Centrifugo releases](https://github.com/centrifugal/centrifugo/releases)
into `infra/bin/` (git ignores it) and run:

```bash
infra/bin/centrifugo.exe --config infra/centrifugo/config.json
```

Chat still works without Centrifugo; it refreshes every few seconds instead of live.

Uploaded files go to `backend/media/` (git-ignored, `MEDIA_ROOT` in `.env`). That folder is
never served directly: every download goes through a permission check. `MAX_UPLOAD_MB`
(default 20) caps file size.

Background worker and scheduler, once Redis is running (without Redis, tasks run inline):

```bash
cd backend
uv run celery -A config worker -l info
```

```bash
cd backend
uv run celery -A config beat -l info
```

Beat publishes scheduled notices every minute, and runs the assignment notifications every 5
minutes: work that has just opened, and reminders 24 hours before a deadline for students who
haven't submitted. Notification emails go out from the worker too. Without Redis, everything
runs inline, notice pages publish anything due when they load, and this command does the rest
(run it by hand or from a scheduler):

```bash
cd backend
uv run python manage.py send_reminders
```

## Admin area

Institution admins get **Manage** in the web app (sign in as `nadia@demo.campusverse.test`):
overview with room clashes, people and invites, roles, **courses and sections** (terms,
departments, programs, courses, sections, teachers and enrollment), correction requests, the
audit log, and **timetable import**. Department coordinators get Courses for their own departments.

**Imports & sync** takes CSV or Excel (.xlsx) files of three kinds; download a template for
each from the page:

| Kind | Columns | Matched by |
|---|---|---|
| Timetable | `course_code, section, day, start, end, room` (+ `kind, mode`) | course, section, day, start time |
| People | `email, first_name, last_name, kind` (+ `external_id`) | your institution's ID, then email |
| Enrollment | `course_code, section, person` (+ `role`: student or teacher) | section + person (email or ID) |

You always get a dry-run preview first (new, updated, unchanged, errors, and room clashes for
timetables). Nothing is applied until you say so, the plan is re-checked at that moment, and
records missing from a file are listed but never deleted or dropped. New people get an invite
email with a one-time link to set a password; with `EMAIL_URL=consolemail://` the email is
printed in the backend log.

**Sync sources** fetch an export your institution publishes at an `https://` address, daily,
hourly or on demand, optionally with an `Authorization` header. Every fetch becomes the same
preview. It applies itself only if you allow it and the run looks routine (no errors, not an
unusual number of changes or missing records); otherwise it waits for review and the source's
owner gets a notification, as they do when a fetch fails. Sources must be public addresses
(`SYNC_ALLOW_PRIVATE`, on by default in development, relaxes that). Timetables show where
imported classes came from and when they were last synchronized.

## Checks

```bash
cd backend
uv run pytest
uv run ruff check .
```

```bash
cd web
npm run lint
npx tsc --noEmit
npm run build
```

## Where things live

```
backend/
  config/            settings, URLs, API root, Celery
  apps/core/         tenancy base models, audience resolver, Centrifugo client
  apps/academic/     institutions, departments, programs, terms, courses, sections
  apps/identity/     email-login user, scoped roles, sign-up policy
  apps/enrollment/   teacher assignments, section enrollments
  apps/scheduling/   rooms, weekly class meetings, one-off changes, timetable API
  apps/notices/      notices, publish service, API
  apps/chat/         section chats, messages, read state, moderation, realtime tokens
  apps/assignments/  assignments, submissions (attempts, lateness), grades, release, downloads
  apps/core/files.py upload checks: allow-listed types verified by content, size limit
  apps/notifications/ in-app notifications: fan-out, no duplicates, live push, reminders
  apps/administration/ admin API: overview, people and invites, roles, timetable import, audit
  apps/feed/         campus feed: posts, comments, reactions, reports, moderation
  apps/resources/    course material: files and links per section, versions, archive
  apps/events/       calendar events: exams, holidays, seminars; sign-ups with a waitlist
  apps/governance/   append-only audit log
  tests/
web/
  src/app/           routes: sign-in, (app)/today, timetable, chat, notices; globals.css
  src/components/    app shell, chat list and thread, class row, icons
  src/lib/           API client, auth, queries, chat + realtime hooks, formatting
infra/
  docker-compose.yml
  centrifugo/config.json
```

The rules every feature follows are in [`docs/architecture.md`](docs/architecture.md).
