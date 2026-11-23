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

## Building for release

Release builds talk to the live servers: `.env.production` holds the API address
(`https://campusverse-api-gm4t.onrender.com`, see `docs/deploy.md`). The live-chat address comes
from the API itself.

### The signing key

Android only accepts updates signed with the same key, so the upload key is kept off the repo:

- the key: `~/.campusverse/campusverse-upload.jks` on the machine that builds;
- its passwords: four `CAMPUSVERSE_UPLOAD_*` lines in that machine's `~/.gradle/gradle.properties`
  (the `with-release-signing` config plugin reads them).

**Back up both** (a password manager is a good home). Lose them and the published app can never
be updated. On Google Play, turn on Play App Signing so Google holds the final key and a lost
upload key can be reset.

Without those lines a release build still runs, signed with the debug key, which is fine on your
own phone but can't be published.

### Building on Windows

Needs JDK 17 and the Android SDK. The native build uses CMake 3.31.6 (the SDK manager installs
it), since older CMake can't handle the long paths Windows gives this project.

```bash
npm run release:android
```

That runs `expo prebuild` and Gradle, then files the APK in `dist/` (git-ignored) under its
version, with a SHA-256 checksum beside it:

```
dist/CampusVerse-v1.1.0-build3.apk
dist/CampusVerse-v1.1.0-build3.apk.sha256
```

Before each release, raise `expo.android.versionCode` in `app.json` by one (Android only installs
an update with a higher build number) and `expo.version` for people to see. The script refuses a
build number that is already in `dist/`.

The APK carries native code for real phones only (64-bit `arm64-v8a` and older 32-bit
`armeabi-v7a`), compressed, with unused code and resources removed: `expo-build-properties` in
`app.json` sets this. To run on an x86 emulator, build with
`./gradlew app:assembleDebug -PreactNativeArchitectures=x86_64`. For Google Play, `./gradlew
app:bundleRelease` makes the AAB in `android/app/build/outputs/bundle/release/`.

### With EAS instead

```bash
npx eas-cli@latest build --platform android
npx eas-cli@latest build --platform ios
```

EAS keeps its own copy of the signing key. The bundle ID is `pk.campusverse.app` in `app.json`.
