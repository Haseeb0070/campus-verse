# CampusVerse mobile

The phone app for students and teachers: Today, Timetable, Chat, Notices and Coursework, built
with Expo (React Native) from the "CampusVerse Mobile App" design canvas. One codebase for
Android and iOS, talking to the same Django API as the website.

## What's in it

| Screen | What it does |
|---|---|
| Sign in | College email and password, two-step codes, and "Forgot your password?" |
| Today | The next class (with room changes and the section chat), the rest of today, work due soon, recent chats, the latest notice |
| Timetable | The week, a day at a time: swipe or tap days, a "Now" line, cancelled, moved and room-changed classes |
| Chat | Section chats, direct messages and message requests. Live over Centrifugo (polls without it), typing, who's online, files, retry when a send fails, long-press to delete |
| Notices | The board, filtered by All, Important or This week |
| Coursework | Due, Handed in and Marked; hand in text and files; marks and feedback once released. Teachers see hand-in counts |
| Progress | Released marks and attendance, course by course |
| Notifications | Everything that happened, and banners for what happens while the app is open |
| Search | Notices, coursework, courses, people and chat messages |
| You | Light or dark (kept on the account, like the website), preferred name, notification settings, sign out |

The colours follow the institution's theme from Manage → Theme on the website, presets and
custom colours alike. Managing classes, marking and admin work stay on the website.

## How it signs in

The app uses allauth's headless **app** client: `POST /_allauth/app/v1/auth/login` returns a
session token, kept in the phone's keychain (`expo-secure-store`) and sent as `X-Session-Token`.
The API accepts it next to the website's cookie (`AppSessionAuth` in `backend/config/api.py`).
No cookies, so no CSRF. Signing out deletes the session on the server.

## Run it

Start Django first (see the main README), listening on your network so a phone can reach it:

```bash
cd backend
uv run python manage.py runserver 0.0.0.0:8010
```

Add your computer's LAN address to `ALLOWED_HOSTS` in `backend/.env` (for example
`ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.20`). Then:

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). In development the app finds
Django on the computer running Expo, port 8010. To use another server, set
`EXPO_PUBLIC_API_URL`, for example `EXPO_PUBLIC_API_URL=https://api.college.edu.pk`.

Live chat needs Centrifugo reachable from the phone too: set `CENTRIFUGO_WS_URL` in
`backend/.env` to your computer's address (the app swaps a `localhost` URL for the API's host on
its own).

The web preview (`npx expo start --web`, port 8081) calls Django from another origin, so it needs
`MOBILE_WEB_ORIGINS=http://localhost:8081` in `backend/.env`. Phones don't.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## Building for the stores

```bash
npx eas-cli@latest build --platform android
npx eas-cli@latest build --platform ios
```

The bundle ID is `pk.campusverse.app` in `app.json`; change it to your own before publishing.
Production builds need `EXPO_PUBLIC_API_URL` set to an `https://` address.
