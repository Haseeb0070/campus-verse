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
timetable including a moved class and a room change, and notices. Demo accounts, all with the
password `campusverse-demo`:

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

Background worker, once Redis is running:

```bash
cd backend
uv run celery -A config worker -l info
```

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
