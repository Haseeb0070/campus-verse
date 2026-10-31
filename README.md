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
uv run python manage.py createsuperuser
uv run python manage.py runserver
```

Web app, on http://localhost:3000 (it proxies `/api` and `/_allauth` to Django). If Django
runs on another port, copy `web/.env.example` to `web/.env.local` and change the URLs:

```bash
cd web
npm install
npm run dev
```

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
  apps/notices/      notices, publish service, API
  apps/governance/   append-only audit log
  tests/
web/
  src/app/           routes and globals.css (design tokens)
  src/components/
infra/
  docker-compose.yml
  centrifugo/config.json
```

The rules every feature follows are in [`docs/architecture.md`](docs/architecture.md).
