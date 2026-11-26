# Mobile parity with the web app (students and teachers)

Inventory of `web/src/app/(app)/` and `web/src/components/` against `mobile/src/app/` and
`mobile/src/lib/`. Admin-only `manage/` is out of scope. Attendance is being changed in another
session and is left alone here.

Status: **Have** = mobile already does it · **Gap** = missing · **Built** = added in this pass ·
**Skip** = left out on purpose (reason given).

**Status (26 Nov 2026): every gap below is built.** `npx tsc --noEmit` passes in `mobile/`, the full web bundle builds, and the forms were tried in Expo web against a local demo API (create + mark an assignment end to end; the other screens rendered with data). Not yet tried on a phone build.

## Already on mobile

| Feature | Role | Web | Mobile |
|---|---|---|---|
| Today (next class, today's list, due soon, coming up, chats, notices, feed peek) | all | `today/page.tsx` | Have, `(tabs)/index.tsx` |
| Timetable (week, changes, running late) | all | `timetable/page.tsx` | Have, `(tabs)/timetable.tsx` |
| Change a class (cancel, move, re-room, running late) | teacher, CR/GR | `change-class-dialog.tsx` | Have, `class.tsx` |
| Class requests (CR/GR approvals, teacher settings) | teacher, CR/GR | `requests/page.tsx` | Have, `requests.tsx` |
| Chat (threads, new message, read receipts) | all | `chat/*` | Have, `(tabs)/chat.tsx`, `chat/[id].tsx`, `new-chat.tsx` |
| Notices board (filters) | all | `notices/page.tsx` (board) | Have, `(tabs)/notices.tsx` |
| Assignments list + hand in | student | `assignments/page.tsx`, `assignments/[id]` | Have, `(tabs)/work.tsx`, `assignment/[id].tsx` |
| Progress (released marks, attendance) | student | `progress/page.tsx` | Have, `progress.tsx` |
| Course materials (browse, open, versions) | all | `resources/page.tsx`, `resources/[id]` | Have, `resources/*` |
| Calendar (month, event, sign up / waitlist) | all | `calendar/page.tsx`, `calendar/[id]` | Have, `calendar/*` |
| Campus feed (post, like, comment, report) | all | `feed/page.tsx` | Have, `feed/*` |
| Notifications list | all | `notifications/page.tsx` | Have, `notifications.tsx` |
| Search | all | `search/page.tsx` | Have, `search.tsx` |
| Profile: name, appearance, read receipts, notification prefs, password/2FA | all | `profile/page.tsx` | Have, `profile.tsx`, `security.tsx` |

## Gaps, in batches

### Batch 1: teacher coursework
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Set an assignment (subject, title, instructions, opens, due, type, points, attempts, late work, files), save draft or publish | teacher | `assignments/new`, `assignment-form.tsx` | Built: `assignment/edit.tsx`, "New assignment" on Work → Teaching |
| Edit an assignment, publish a draft, delete it | teacher | `assignments/[id]/edit`, `ManageActions` | Built: Edit / Publish / Delete in the teacher panel |
| Mark submissions (roster, latest hand-in, points + feedback) and release grades | teacher | `assignments/[id]` `TeacherPanel` | Built: `components/marking.tsx` in `assignment/[id].tsx` |
| Download grades (Excel/CSV) | teacher | `grades.csv` link | Built: downloads and opens the share sheet |

### Batch 2: notices for teachers, notice files for everyone
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Notice attachments shown and openable | all | `notices/page.tsx` | Built: files listed on each note in `(tabs)/notices.tsx` |
| Write a notice (audience, priority, files), publish now, schedule, or keep as draft | teacher | `notices/new`, `notice-form.tsx` | Built: `notice/edit.tsx`, "New notice" on the Notices tab |
| My notices (drafts, scheduled, published): edit, publish, archive | teacher | `notices/page.tsx` `MyNoticeRow`, `notices/[id]/edit` | Built: `notice/mine.tsx` |

### Batch 3: my subjects and rosters
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| My subjects (students count, roster, subject chat, post a notice) | teacher | `sections/page.tsx` | Built: `subjects/index.tsx` (Profile → Your subjects); "Set work" instead of "Post a notice" |
| Roster (teachers, students, CR/GR badges, email) + class list / marks downloads | teacher | `sections/[id]/page.tsx` | Built: `subjects/[id].tsx` |

### Batch 4: sharing course materials
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Share a file or link with a subject | teacher | `resources/new/page.tsx` | Built: `resources/share.tsx` (+ on Course materials) |
| Edit details, upload a new version, archive / restore | teacher | `resources/[id]/page.tsx` | Built: `components/resource-manage.tsx` |

### Batch 5: calendar for organisers
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Create / edit an event | teacher (own subjects) | `calendar/new`, `calendar/[id]/edit`, `event-form.tsx` | Built: `calendar/edit.tsx` (+ on Calendar) |
| Cancel an event, see who's going | organiser | `calendar/[id]/page.tsx` | Built: `components/event-manage.tsx` (edit, move, cancel, who's coming) |
| Assignment due dates on the calendar | all | `calendar/page.tsx` | Built: due rows in `calendar/index.tsx` (Everything and Deadlines) |

### Batch 6: smaller parity
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Approve / decline CR/GR requests from the notification itself | teacher, CR | `notifications/page.tsx` `RepButtons` | Built: in `notifications.tsx` |
| Hide / remove posts and comments (moderators, section teachers) | teacher, moderator | `post-card.tsx` | Built: post menu and comment "Hide / Show again" |
| Moderation queue (open reports, resolve) | moderator | `moderation/page.tsx` | Built: `moderation.tsx` (Profile → Moderation) |
| Ask an admin to fix your record | all | `profile/page.tsx` `CorrectionsCard` | Built: Profile → Your record |
| Name your guide (Verse) | all | `profile/page.tsx` `GuideNameCard` | Built: Profile → Your guide (when the college allows it) |

## Deliberately skipped
| Feature | Why |
|---|---|
| `manage/*` (people, academic structure, import, audit, reports, theme, requests) | Admin-only, out of scope. |
| Attendance sheet | Another session is changing attendance now. |
| Helper Q&A panel in the corner | Web desktop widget; on mobile Verse already reacts in the header. |
| Message sound toggle | Web only; phones use the system's notification sound. |
| Appearance toggle details beyond light/dark | Mobile already follows its own setting. |

## Shared pieces added
- `mobile/src/components/form.tsx`: themed `Sheet`, `DateTimeField` (month grid + hour/minute chips, no native picker), `ChoiceField` (chips in place of a select), `Stepper`, `SwitchRow`, `TextArea`, `FormError`.
- `mobile/src/components/files.tsx`: `FileRow` (open/remove a stored or picked file) and `DownloadRow` (CSV for Excel).
- `mobile/src/lib/coursework.ts`, `lib/notices.ts`; hooks added to `lib/resources.ts`, `lib/events.ts`, `lib/feed.ts`.
- Icons `minus`, `link`, `download`, `people`; `lib/links.ts` now opens `/sections/*` and `/moderation` links in the app.
