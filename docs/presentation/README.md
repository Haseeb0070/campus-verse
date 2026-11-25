# CampusVerse presentation film

`campusverse.mp4` is a 60-second, 1920 × 1080 film that presents CampusVerse, hosted by Verse.
It has no sound: Verse's lines are on screen as captions, so it can be talked over.

Everything it is made from is here, so it can be rendered again after a change:

| File | What it is |
| --- | --- |
| `scene/script.json` | The words, the scene times, and the beats (what the phone shows and points at, second by second). Change wording here. |
| `scene/index.html`, `scene/scene.js` | The film itself: one function, `setFrame(seconds)`, that lays out every element. |
| `shots/` | Real screenshots of the app at phone size (390 × 844, twice as sharp), and `shots.json` with where the pointed-at things are. |
| `capture.mjs` | Takes those screenshots from the app running locally. |
| `seed_video_data.py` | Sample coursework (one changed class, four assignments, three weeks of attendance) for a **copy** of the local database. |
| `render.mjs` | Draws every frame in headless Chrome, encodes H.264 with Chrome's own encoder and writes the MP4. |

Needs Node 22 and Google Chrome. No ffmpeg, no npm packages beyond what `web/` already installs
(the fonts and Verse's avatar engine are read from `web/node_modules`).

## Render again

```sh
node docs/presentation/render.mjs                    # about 10 minutes -> campusverse.mp4
node docs/presentation/render.mjs --stills 8.5,24.5  # single frames into stills/, to check a change
```

## Take the screenshots again

The screenshots come from the local app, never the live site, and no password is typed.

1. Copy `backend/db.sqlite3` somewhere outside the repo with "video" in its name, and fill it:

   ```sh
   cd backend
   DATABASE_URL=sqlite:///C:/path/video.sqlite3 PUSH_ENABLED=false EMAIL_URL=consolemail:// \
     uv run python manage.py shell < ../docs/presentation/seed_video_data.py
   ```

   The script refuses to run on any other database. It writes rows directly, with push and email
   off, so no student is notified. Its dates are fixed to the week of 23 November 2026; change
   `TODAY` when taking new screenshots in another week.

2. Run a backend on that copy on port 8013 (same three variables, `manage.py runserver 8013`),
   with the web app on port 3000 as usual. `capture.mjs` answers the page's `/api` calls from
   port 8013, so the normal local database is never touched.

3. Make a signed-in session for the student, the teacher and the admin in the Django shell of the
   copy, and save the three lines it prints as `docs/presentation/sessions.txt` (git-ignored):

   ```python
   from django.contrib.sessions.backends.db import SessionStore
   from django.contrib.auth import get_user_model, SESSION_KEY, BACKEND_SESSION_KEY, HASH_SESSION_KEY
   for e in ["126139@gcslahore.edu.pk", "nabeel@gcslahore.edu.pk", "admin@gcslahore.edu.pk"]:
       u = get_user_model().objects.get(email=e)
       s = SessionStore()
       s[SESSION_KEY] = str(u.pk)
       s[BACKEND_SESSION_KEY] = "django.contrib.auth.backends.ModelBackend"
       s[HASH_SESSION_KEY] = u.get_session_auth_hash()
       s.create()
       print("SESS", e, s.session_key)
   ```

4. `node docs/presentation/capture.mjs` (or name shots to retake only those, e.g. `capture.mjs today chat`).

## What is real and what is sample

Every screen is the real app with the college's real timetable, subjects, rooms, teachers and
class list. The coursework on it is sample data added to the copy for the film: the "Project
proposal" assignment, the three marked pieces of work, the attendance figures and Friday's room
change. The in-app guide button and the local test teacher are left out of the shots.
