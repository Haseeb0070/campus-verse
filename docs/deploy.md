# Put CampusVerse online for testing

A free test site, built from this repository, that runs next to your local setup without touching
it. About 30 minutes the first time.

| Piece | Where | Plan |
|---|---|---|
| Web app (the link testers open) | [Vercel](https://vercel.com) | Hobby (free) |
| Database | [Neon](https://neon.tech) | Free |
| Django API, and live chat (Centrifugo) | [Render](https://render.com), from [`render.yaml`](../render.yaml) | Free |
| Scheduled jobs: publishing scheduled notices, reminders, sync | [cron-job.org](https://cron-job.org) calls the API | Free |

## Your PC stays as it is

Nothing below changes how CampusVerse runs locally. The code reads every address and secret
from settings, and falls back to local values when they're missing.

| | Your PC | Test site |
|---|---|---|
| Database | SQLite (`backend/db.sqlite3`) | Neon |
| Live chat | Centrifugo on port 8001 | Centrifugo on Render |
| Settings | `backend/.env`, `web/.env.local` (never committed) | Each provider's dashboard |
| How it updates | `npm run dev`, `runserver`, as now | Automatically when you push to `main` |

The two databases are separate: what testers do online never reaches your PC, and your local
experiments never reach testers.

## 1. Put the code on GitHub

Create an empty repository on GitHub (private is fine), then from the project folder:

```bash
git remote add origin https://github.com/<your-account>/campusverse.git
git push -u origin main
```

## 2. Neon: create the database

1. Sign up at [neon.tech](https://neon.tech) and create a project called `campusverse`. Pick the
   region closest to where Render will run (for example Frankfurt for Europe and Asia).
2. Press **Connect**, turn **Connection pooling off**, and copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-….neon.tech/neondb?sslmode=require`. Keep it for step 4.

## 3. Vercel: put the web app online

1. Sign up at [vercel.com](https://vercel.com) with GitHub, choose **Add New → Project**, and
   import the repository.
2. Set **Root Directory** to `web`. Vercel recognises Next.js by itself.
3. Under **Environment Variables** add `BACKEND_URL` = `https://campusverse-api.onrender.com`
   (you'll check this address in step 4).
4. Press **Deploy**. Note your address, for example `https://campusverse.vercel.app`.

## 4. Render: put the API and live chat online

1. Sign up at [render.com](https://render.com) with GitHub, choose **New → Blueprint**, and pick
   the repository. Render reads `render.yaml` and asks for three values:

   | Value | What to paste |
   |---|---|
   | `DATABASE_URL` | The Neon connection string from step 2 |
   | `FRONTEND_URL` | Your Vercel address, e.g. `https://campusverse.vercel.app` (no slash at the end) |
   | `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS` | The same Vercel address |

2. Press **Apply**. The first deploy takes about 10 minutes. It creates the tables in Neon and
   loads Demo University.
3. Check the two service addresses. If they are exactly `campusverse-api.onrender.com` and
   `campusverse-realtime.onrender.com`, carry on. If Render added a suffix because a name was
   taken, update the matching settings and redeploy:

   | Where | Setting | Should be |
   |---|---|---|
   | Vercel (then **Redeploy**) | `BACKEND_URL` | `https://<api address>` |
   | Render, campusverse-api | `CENTRIFUGO_API_URL` | `https://<realtime address>/api` |
   | Render, campusverse-api | `CENTRIFUGO_WS_URL` | `wss://<realtime address>/connection/websocket` |

## 5. cron-job.org: run the scheduled jobs

1. In Render, open **campusverse-api → Environment** and copy the value of `CRON_SECRET`.
2. Sign up at [cron-job.org](https://cron-job.org) and create a cron job:
   - **URL:** `https://campusverse-api.onrender.com/api/cron`
   - **Schedule:** every 30 minutes
   - **Advanced → Request method:** `POST`
   - **Advanced → Headers:** `Authorization` = `Bearer <the CRON_SECRET value>`
   - **Advanced → Timeout:** the longest it allows, because the first call after a quiet spell
     wakes the API, which takes about a minute.
3. Save, then press **Test run**. A good answer looks like
   `{"notices_published": 0, "notifications": {…}, "sources_synced": 0}`.

Scheduled notices then go out within 30 minutes of their time. A shorter schedule keeps the API
awake around the clock and uses up Render's free hours (see below).

## 6. Sign in

Open your Vercel address and sign in with a demo account. Every account's password is
`campusverse-demo`:

- `ayesha@demo.campusverse.test` (student)
- `imran@demo.campusverse.test` (teacher)
- `nadia@demo.campusverse.test` (institution admin)

Anyone with the link can use these accounts, so share it only with your testers.

## Working on it after that

1. Build and try changes locally, as now.
2. Push to a branch, for example `dev`. Vercel gives every branch its own preview link.
3. Merge into `main`. Vercel and Render redeploy the test site in a few minutes.

Preview links show the app but can't sign in until you allow them. Vercel gives each branch a
fixed address like `https://campusverse-git-dev-yourname.vercel.app`; add it to
`EXTRA_TRUSTED_ORIGINS` on campusverse-api, and to `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS` on
campusverse-realtime after a space.

## How long it lasts, and the catches

None of these free plans has an end date. Free plans do change, so look at the providers'
pricing pages now and then.

- **Render gives 750 free hours a month, shared by the API and live chat.** Both sleep after 15
  minutes without visitors, which keeps them inside the limit. The first visit after a quiet
  spell takes about a minute; if sign-in fails then, wait a moment and try again. Upgrading only
  the API to **Starter** (about $7/month) keeps it awake.
- **Live chat while Centrifugo sleeps:** messages still arrive, by checking every few seconds,
  until it wakes.
- **Uploaded files need Cloudflare R2.** The API server's disk is wiped at every deploy and
  restart, so uploads (photos, PDFs, hand-ins) are kept in an R2 bucket (free up to 10 GB):
  1. In the Cloudflare dashboard, open **R2**, create a bucket (for example
     `campusverse-uploads`), and leave public access off.
  2. **R2 > Manage API tokens > Create API token**: permission **Object Read & Write**, applied
     to that bucket only. Copy the **Access Key ID** and **Secret Access Key** (shown once).
  3. On Render, campusverse-api > **Environment**, set `R2_BUCKET`, `R2_ACCOUNT_ID` (on the
     R2 overview page), `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, then save and deploy.
  4. The deploy log says `Uploads: stored in Cloudflare R2 bucket ...` when it works.
  Without these, uploads stay on the server's disk and are lost at the next deploy.
- **Emails aren't sent.** Invites and password resets appear in Render's **Logs** tab for
  campusverse-api. To send real email, set `EMAIL_URL` to an SMTP provider.
- **Background tasks run inside the request** (there's no Redis on the free setup), so a big
  import makes that one request slower.

## Before real students use it

Set `DEMO_SEED` to `false`, start from a fresh Neon database, create the real admin account, and
add a mail provider so invites reach people.
