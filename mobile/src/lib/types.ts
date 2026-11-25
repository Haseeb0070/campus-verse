export type CourseColor =
  | "lagoon"
  | "tangerine"
  | "orchid"
  | "rose"
  | "sky"
  | "lime"
  | "gold"
  | "slate";

export interface Me {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  preferred_name: string;
  two_step: boolean;
  appearance: "light" | "dark";
  /** "Seen" in one-to-one chats, both ways. */
  read_receipts?: boolean;
  full_name: string;
  kind: "student" | "teacher" | "staff";
  institution: {
    id: number;
    name: string;
    timezone: string;
    attendance_enabled: boolean;
    attendance_visible_to_students: boolean;
  } | null;
  roles: string[];
  sections: {
    id: number;
    code: string;
    course_code: string;
    course_title: string;
    color: CourseColor;
    term: string;
    teaching: boolean;
  }[];
}

export interface Audience {
  key: string;
  scope_type: string;
  scope_id: number;
  label: string;
  group: "Institution" | "Departments" | "Subjects";
  detail: string;
  reach: number;
}

export interface MyNotice {
  id: number;
  title: string;
  body: string;
  priority: "normal" | "important";
  status: "draft" | "scheduled" | "published" | "archived";
  published_at: string | null;
  publish_at: string | null;
  expires_at: string | null;
  expired: boolean;
  updated_at: string;
  targets: { key: string; label: string }[];
  reach: number;
}

export interface Room {
  id: number;
  code: string;
  building: string;
}

export interface SectionSummary {
  id: number;
  code: string;
  course_code: string;
  course_title: string;
  color: CourseColor;
  term: string;
  students: number;
}

export interface Person {
  id: number;
  name: string;
  email: string;
  initials: string;
}

export interface Roster {
  section: SectionSummary;
  teachers: Person[];
  students: Person[];
}

export type OccurrenceStatus = "scheduled" | "cancelled" | "moved" | "room_changed" | "rescheduled";

export interface Occurrence {
  meeting_id: number;
  section_id: number;
  section_code: string;
  course_code: string;
  course_title: string;
  color: CourseColor;
  kind: "lecture" | "lab" | "tutorial";
  date: string;
  starts_at: string;
  ends_at: string;
  room: string;
  mode: "in_person" | "online";
  online_url: string;
  teachers: string[];
  status: OccurrenceStatus;
  note: string;
  moved_to: string | null;
  moved_from: string | null;
  change_id: number | null;
  can_manage: boolean;
  /** "cr" / "gr" when the viewer is their section's CR or GR: they may cancel or shift it. */
  rep_role?: "cr" | "gr" | null;
  /** The teacher said they're running this many minutes late (0: on time). */
  late_minutes?: number;
  /** Where the class came from (an import or sync source) and when it was last synchronized. */
  source: string | null;
  synced_at: string | null;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  client_id: string;
  body: string;
  deleted: boolean;
  created_at: string;
  sender: { id: number; name: string; initials: string; is_teacher: boolean };
  attachments?: StoredFileInfo[];
  /** Client-only: optimistic state while sending. */
  pending?: boolean;
  failed?: boolean;
}

export interface Conversation {
  id: number;
  kind: "section" | "group" | "direct";
  section_id: number | null;
  title: string;
  course_title: string | null;
  section_code: string | null;
  color: CourseColor | null;
  unread: number;
  is_moderator: boolean;
  last_message: ChatMessage | null;
  last_message_at: string | null;
  /** The other person, in a one-to-one chat. */
  other: ChatPerson | null;
  muted: boolean;
  /** Private chats start as a request the other person accepts; everything else is "accepted". */
  request_status: "pending" | "accepted" | "declined";
  requested_by_me: boolean;
  /** One-to-one chats where both share "Seen": the newest message the other person has read. */
  seen_up_to?: number | null;
}

export interface ChatPerson {
  id: number;
  name: string;
  initials: string;
  kind: "student" | "teacher" | "staff";
  detail: string;
}

export interface MessagePage {
  messages: ChatMessage[];
  has_more: boolean;
}

export interface StoredFileInfo {
  id: number;
  name: string;
  size: number;
  content_type: string;
}

export interface SubmissionInfo {
  id: number;
  attempt: number;
  text: string;
  files: StoredFileInfo[];
  submitted_at: string;
  is_late: boolean;
}

export interface GradeInfo {
  points: string;
  feedback: string;
}

export type SubmissionWindow = "not_open" | "open" | "late" | "closed";

export interface Assignment {
  id: number;
  title: string;
  instructions: string;
  status: "draft" | "published";
  section_id: number;
  section_code: string;
  course_code: string;
  course_title: string;
  color: CourseColor;
  available_from: string;
  due_at: string;
  submission_type: "text" | "file" | "both";
  max_points: number;
  allow_late: boolean;
  late_until: string | null;
  max_attempts: number;
  grades_released: boolean;
  window: SubmissionWindow;
  can_manage: boolean;
  attachments: StoredFileInfo[];
  my_attempts: number | null;
  my_submissions: SubmissionInfo[] | null;
  my_grade: GradeInfo | null;
  submitted_count: number | null;
  graded_count: number | null;
  student_count: number | null;
}

export interface AssignmentRosterRow {
  student: Person;
  attempts: number;
  latest: SubmissionInfo | null;
  grade: GradeInfo | null;
}

export type NotificationKind =
  | "notice.published"
  | "class.changed"
  | "assignment.opened"
  | "assignment.due_soon"
  | "grades.released"
  | "feed.comment"
  | "moderation.action"
  | "resource.shared"
  | "account.correction"
  | "event.update";

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  created_at: string;
  read: boolean;
}

export interface Notice {
  id: number;
  title: string;
  body: string;
  priority: "normal" | "important";
  published_at: string | null;
  author_name: string;
}
