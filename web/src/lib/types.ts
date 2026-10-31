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
  full_name: string;
  kind: "student" | "teacher" | "staff";
  institution: { id: number; name: string; timezone: string } | null;
  roles: string[];
  sections: {
    id: number;
    code: string;
    course_code: string;
    course_title: string;
    color: CourseColor;
    term: string;
  }[];
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
}

export interface Notice {
  id: number;
  title: string;
  body: string;
  priority: "normal" | "important";
  published_at: string | null;
  author_name: string;
}
