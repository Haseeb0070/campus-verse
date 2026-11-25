# Mobile parity with the web app (students and teachers)

Inventory of `web/src/app/(app)/` and `web/src/components/` against `mobile/src/app/` and
`mobile/src/lib/`. Admin-only `manage/` is out of scope. Attendance is being changed in another
session and is left alone here.

Status: **Have** = mobile already does it · **Gap** = missing · **Built** = added in this pass ·
**Skip** = left out on purpose (reason given).

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
| Set an assignment (subject, title, instructions, opens, due, type, points, attempts, late work, files), save draft or publish | teacher | `assignments/new`, `assignment-form.tsx` | Gap |
| Edit an assignment, publish a draft, delete it | teacher | `assignments/[id]/edit`, `ManageActions` | Gap |
| Mark submissions (roster, latest hand-in, points + feedback) and release grades | teacher | `assignments/[id]` `TeacherPanel` | Gap (mobile says "use the website") |
| Download grades (Excel/CSV) | teacher | `grades.csv` link | Gap |

### Batch 2: notices for teachers, notice files for everyone
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Notice attachments shown and openable | all | `notices/page.tsx` | Gap |
| Write a notice (audience, priority, files), publish now, schedule, or keep as draft | teacher | `notices/new`, `notice-form.tsx` | Gap |
| My notices (drafts, scheduled, published): edit, publish, archive | teacher | `notices/page.tsx` `MyNoticeRow`, `notices/[id]/edit` | Gap |

### Batch 3: my subjects and rosters
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| My subjects (students count, roster, subject chat, post a notice) | teacher | `sections/page.tsx` | Gap |
| Roster (teachers, students, CR/GR badges, email) + class list / marks downloads | teacher | `sections/[id]/page.tsx` | Gap |

### Batch 4: sharing course materials
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Share a file or link with a subject | teacher | `resources/new/page.tsx` | Gap |
| Edit details, upload a new version, archive / restore | teacher | `resources/[id]/page.tsx` | Gap |

### Batch 5: calendar for organisers
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Create / edit an event | teacher (own subjects) | `calendar/new`, `calendar/[id]/edit`, `event-form.tsx` | Gap |
| Cancel an event, see who's going | organiser | `calendar/[id]/page.tsx` | Gap |
| Assignment due dates on the calendar | all | `calendar/page.tsx` | Gap |

### Batch 6: smaller parity
| Feature | Role | Web | Mobile status |
|---|---|---|---|
| Approve / decline CR/GR requests from the notification itself | teacher, CR | `notifications/page.tsx` `RepButtons` | Gap |
| Hide / remove posts and comments (moderators, section teachers) | teacher, moderator | `post-card.tsx` | Gap |
| Moderation queue (open reports, resolve) | moderator | `moderation/page.tsx` | Gap |
| Ask an admin to fix your record | all | `profile/page.tsx` `CorrectionsCard` | Gap |
| Name your guide (Verse) | all | `profile/page.tsx` `GuideNameCard` | Gap |

## Deliberately skipped
| Feature | Why |
|---|---|
| `manage/*` (people, academic structure, import, audit, reports, theme, requests) | Admin-only, out of scope. |
| Attendance sheet | Another session is changing attendance now. |
| Helper Q&A panel in the corner | Web desktop widget; on mobile Verse already reacts in the header. |
| Message sound toggle | Web only; phones use the system's notification sound. |
| Appearance toggle details beyond light/dark | Mobile already follows its own setting. |
