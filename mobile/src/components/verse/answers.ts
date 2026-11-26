import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useUnreadTotal } from "@/lib/chat";
import { useTeaching } from "@/lib/coursework";
import { formatTime, relativeTime, startsLabel, todayIn } from "@/lib/format";
import { useMyNotices } from "@/lib/notices";
import { useAssignments, useMe, useNextClass, useNotices, useTimetable } from "@/lib/queries";
import type { Me } from "@/lib/types";

/*
 * What the guide answers, by role: the same questions as the website's corner helper
 * (web/src/components/helper/answers.tsx). Each answer is a hook run only once its question is
 * asked, so nobody loads data they didn't ask about. Links are website paths; lib/links turns
 * them into app screens.
 */

export type Role = "student" | "teacher" | "admin";
export type Mood = "happy" | "excited" | "surprised" | "proud" | "shy";
export type Answer = { text: string; link?: { href: string; label: string }; mood?: Mood };
/** null while the data loads. */
type Reply = Answer | null;

export interface Question {
  id: string;
  ask: string;
  useReply: (ctx: { name: string }) => Reply;
}

/** Admins first (they may also teach), then anyone who teaches, then students. */
export function roleOf(me: Me | undefined): Role {
  if (!me) return "student";
  if (me.roles.includes("institution_admin")) return "admin";
  if (me.kind === "teacher" || me.sections.some((s) => s.teaching)) return "teacher";
  return "student";
}

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function useTz() {
  return useMe().data?.institution?.timezone;
}

/* ---------- Shared ---------- */

function useUnread(): Reply {
  const unread = useUnreadTotal();
  return unread
    ? { text: `You have ${plural(unread, "unread message")}.`, link: { href: "/chat", label: "Open chat" }, mood: "excited" }
    : { text: "No unread messages. Your chats are all read.", link: { href: "/chat", label: "Open chat" } };
}

function useNextClassReply(teaching: boolean): Reply {
  const tz = useTz();
  const next = useNextClass();
  if (next.isPending) return null;
  const c = next.data;
  if (!c) {
    return {
      text: teaching ? "No classes to teach in the next few weeks." : "Nothing on your timetable for the next few weeks. Enjoy the quiet!",
      link: { href: "/timetable", label: "Open timetable" },
    };
  }
  const when = startsLabel(c.date, c.starts_at, todayIn(tz), tz);
  const where = c.mode === "online" ? "online" : `in ${c.room}`;
  const who = !teaching && c.teachers.length ? ` with ${c.teachers.join(" and ")}` : "";
  const section = teaching ? `, section ${c.section_code}` : "";
  return {
    text: `${c.course_title} (${c.course_code}${section}). ${when}, ${where}${who}.`,
    link: { href: "/timetable", label: "Open timetable" },
  };
}

/* ---------- Students ---------- */

const STUDY_TIPS = [
  "Study in 25-minute blocks with a 5-minute break. After four, take a longer one.",
  "Explain today’s lecture to a friend in your subject chat. If you can teach it, you know it.",
  "Write tomorrow’s first task before you close your notes tonight. Starting is the hard part.",
  "Put your phone in another room for one focused hour. You’ll be surprised.",
  "Redo one solved problem without looking. That beats reading the solution three times.",
  "Sleep is study too: memories settle while you rest.",
];

const STUDENT: Question[] = [
  { id: "next", ask: "What’s my next class?", useReply: () => useNextClassReply(false) },
  {
    id: "due",
    ask: "Anything due soon?",
    useReply: () => {
      const assignments = useAssignments();
      if (assignments.isPending) return null;
      const now = Date.now();
      const open = (assignments.data ?? [])
        .filter((a) => a.status === "published" && new Date(a.due_at).getTime() > now)
        .filter((a) => !(a.my_submissions && a.my_submissions.length > 0))
        .sort((a, b) => a.due_at.localeCompare(b.due_at));
      if (!open.length) {
        return { text: "Nothing due right now. You’re all caught up!", link: { href: "/assignments", label: "See coursework" }, mood: "excited" };
      }
      const first = open[0];
      const more = open.length > 1 ? ` And ${open.length - 1} more after that.` : "";
      return {
        text: `${first.title} for ${first.course_code} is due ${relativeTime(first.due_at)}.${more}`,
        link: { href: `/assignments/${first.id}`, label: "Open it" },
      };
    },
  },
  {
    id: "notices",
    ask: "Any new notices?",
    useReply: () => {
      const notices = useNotices(5);
      if (notices.isPending) return null;
      const list = notices.data ?? [];
      if (!list.length) return { text: "No notices yet. I’ll be here when one arrives.", link: { href: "/notices", label: "Open notices" } };
      const latest = list[0];
      const important = list.filter((n) => n.priority === "important").length;
      const when = latest.published_at ? `, ${relativeTime(latest.published_at)}` : "";
      const flag = important ? ` ${important} of the latest ${list.length} ${important === 1 ? "is" : "are"} marked important.` : "";
      return { text: `The newest is “${latest.title}” from ${latest.author_name}${when}.${flag}`, link: { href: "/notices", label: "Open notices" } };
    },
  },
  { id: "unread", ask: "Unread messages?", useReply: useUnread },
  { id: "tip", ask: "Give me a study tip", useReply: () => ({ text: pick(STUDY_TIPS), mood: "proud" }) },
  {
    id: "who",
    ask: "Who are you?",
    useReply: ({ name }) => ({
      text: `I’m ${name}, CampusVerse’s guide. Ask me about your classes, coursework, notices or messages, and I’ll look them up for you.`,
      mood: "shy",
    }),
  },
];

/* ---------- Teachers ---------- */

const TEACHING_TIPS = [
  "Pin the one notice that matters most this week; students read pinned notices first.",
  "Open the subject chat for ten minutes after class. Quick answers save a lot of email.",
  "Release grades with a short comment on the most common mistake. It teaches the whole class.",
  "Mark attendance in the first five minutes, on your phone, while students settle.",
  "Post the next class’s reading in the subject chat the evening before.",
  "Schedule reminders as notices: write them on Monday, let them go out on Thursday.",
];

const TEACHER: Question[] = [
  { id: "next", ask: "What do I teach next?", useReply: () => useNextClassReply(true) },
  {
    id: "grading",
    ask: "What’s left to grade?",
    useReply: () => {
      const assignments = useAssignments();
      if (assignments.isPending) return null;
      const waiting = (assignments.data ?? [])
        .filter((a) => a.can_manage)
        .map((a) => ({ a, left: Math.max(0, (a.submitted_count ?? 0) - (a.graded_count ?? 0)) }))
        .filter((x) => x.left > 0)
        .sort((x, y) => y.left - x.left);
      if (!waiting.length) {
        return { text: "Nothing waiting to be graded. Every hand-in has a grade.", link: { href: "/assignments", label: "See assignments" }, mood: "excited" };
      }
      const total = waiting.reduce((sum, x) => sum + x.left, 0);
      const top = waiting[0];
      return {
        text: `${plural(total, "hand-in")} to grade across ${plural(waiting.length, "assignment")}. Most are in “${top.a.title}” (${top.a.course_code}): ${top.left}.`,
        link: { href: `/assignments/${top.a.id}`, label: "Start grading" },
        mood: total > 20 ? "surprised" : "happy",
      };
    },
  },
  {
    id: "today",
    ask: "My classes today?",
    useReply: () => {
      const tz = useTz();
      const today = todayIn(tz);
      const timetable = useTimetable(today, 1);
      if (timetable.isPending) return null;
      const list = (timetable.data ?? []).filter((c) => c.date === today && c.status !== "cancelled");
      if (!list.length) return { text: "No classes today. A good day for grading or planning.", link: { href: "/timetable", label: "Open timetable" } };
      const parts = list.map((c) => `${formatTime(c.starts_at, tz)} ${c.course_code} in ${c.mode === "online" ? "online" : c.room}`);
      return { text: `${plural(list.length, "class", "classes")} today: ${parts.join("; ")}.`, link: { href: "/attendance", label: "Take attendance" } };
    },
  },
  {
    id: "notices",
    ask: "How are my notices doing?",
    useReply: () => {
      const mine = useMyNotices();
      if (mine.isPending) return null;
      const list = mine.data ?? [];
      const published = list.filter((n) => n.status === "published" && !n.expired);
      const scheduled = list.filter((n) => n.status === "scheduled").length;
      const drafts = list.filter((n) => n.status === "draft").length;
      if (!list.length) return { text: "You haven’t posted a notice yet. Your subjects' students will see one as soon as you do.", link: { href: "/notices", label: "Write a notice" } };
      const latest = published[0];
      const head = latest ? `“${latest.title}” reached ${plural(latest.reach, "person", "people")}.` : "Nothing is live right now.";
      const extra = [scheduled && `${scheduled} scheduled`, drafts && plural(drafts, "draft")].filter(Boolean).join(" and ");
      return { text: `${head}${extra ? ` You also have ${extra}.` : ""}`, link: { href: "/notices", label: "Open notices" } };
    },
  },
  {
    id: "students",
    ask: "How many students do I teach?",
    useReply: () => {
      const teaching = useTeaching();
      if (teaching.isPending) return null;
      const list = teaching.data ?? [];
      if (!list.length) return { text: "You aren’t assigned to any subject yet. Ask the college office to add you." };
      const parts = list.map((s) => `${s.course_code} ${s.code} has ${plural(s.students, "student")}`);
      return { text: `You teach ${plural(list.length, "subject")}: ${parts.join("; ")}.`, link: { href: "/sections", label: "See subjects" } };
    },
  },
  { id: "unread", ask: "Unread messages?", useReply: useUnread },
  { id: "tip", ask: "A teaching tip", useReply: () => ({ text: pick(TEACHING_TIPS), mood: "proud" }) },
];

/* ---------- Admins ---------- */

interface Overview {
  students: number;
  teachers: number;
  invited: number;
  signed_in_week: number;
  active_people: number;
  sections: number;
  pending_imports: number;
  room_clashes: { room: string; date: string; time: string; classes: string[] }[];
}

function useOverview() {
  return useQuery({ queryKey: ["manage", "overview"], queryFn: () => apiFetch<Overview>("/api/manage/overview") });
}

function useOpenRequests() {
  return useQuery({
    queryKey: ["corrections", "queue", "open"],
    queryFn: () => apiFetch<{ id: number; topic_label: string; person: { name: string } }[]>("/api/manage/corrections?status=open"),
  });
}

function useRecentAudit() {
  return useQuery({
    queryKey: ["manage", "audit", ""],
    queryFn: () => apiFetch<{ id: number; actor: string | null; action: string; created_at: string }[]>("/api/manage/audit?action="),
  });
}

const ACTION_WORDS: Record<string, string> = {
  "institution.theme_changed": "changed the theme",
  "notice.published": "published a notice",
  "import.applied": "applied an import",
};

const ADMIN: Question[] = [
  {
    id: "college",
    ask: "How’s the college doing?",
    useReply: () => {
      const o = useOverview();
      if (o.isPending) return null;
      if (!o.data) return { text: "I couldn’t load the overview just now." };
      const d = o.data;
      const share = d.active_people ? Math.round((d.signed_in_week / d.active_people) * 100) : 0;
      return {
        text: `${plural(d.students, "student")}, ${plural(d.teachers, "teacher")} and ${plural(d.sections, "active subject")}. ${d.signed_in_week} of ${d.active_people} people (${share}%) signed in this week.`,
        link: { href: "/manage", label: "Open overview" },
      };
    },
  },
  {
    id: "attention",
    ask: "Anything need my attention?",
    useReply: () => {
      const o = useOverview();
      const requests = useOpenRequests();
      if (o.isPending || requests.isPending) return null;
      const items: string[] = [];
      if (o.data?.pending_imports) items.push(`${plural(o.data.pending_imports, "import")} waiting for review`);
      if (o.data?.room_clashes.length) items.push(plural(o.data.room_clashes.length, "room clash", "room clashes"));
      if (requests.data?.length) items.push(plural(requests.data.length, "profile request"));
      if (!items.length) return { text: "All clear: no imports waiting, no room clashes and no open requests.", mood: "excited" };
      return { text: `${items.join(", ")}.`, link: { href: "/manage", label: "Open overview" }, mood: "surprised" };
    },
  },
  {
    id: "clashes",
    ask: "Any room clashes?",
    useReply: () => {
      const o = useOverview();
      if (o.isPending) return null;
      const clashes = o.data?.room_clashes ?? [];
      if (!clashes.length) return { text: "No room is double-booked in the coming week." };
      const c = clashes[0];
      const more = clashes.length > 1 ? ` And ${clashes.length - 1} more.` : "";
      return { text: `${c.room} is double-booked on ${c.date} at ${c.time}: ${c.classes.join(" and ")}.${more}`, link: { href: "/timetable", label: "See timetable" }, mood: "surprised" };
    },
  },
  {
    id: "requests",
    ask: "Requests waiting?",
    useReply: () => {
      const requests = useOpenRequests();
      if (requests.isPending) return null;
      const list = requests.data ?? [];
      if (!list.length) return { text: "No open requests. Everyone’s details are settled." };
      const first = list[0];
      return {
        text: `${plural(list.length, "request")} waiting. The oldest is from ${first.person.name}: ${first.topic_label.toLowerCase()}.`,
        link: { href: "/manage/requests", label: "Review requests" },
      };
    },
  },
  {
    id: "invited",
    ask: "Who hasn’t signed up yet?",
    useReply: () => {
      const o = useOverview();
      if (o.isPending) return null;
      const invited = o.data?.invited ?? 0;
      return invited
        ? { text: `${plural(invited, "person", "people")} were invited but haven’t signed in yet. You can resend their invites.`, link: { href: "/manage/people", label: "Open people" } }
        : { text: "Everyone who was invited has signed in. Nice!", mood: "excited" };
    },
  },
  {
    id: "changes",
    ask: "What changed recently?",
    useReply: () => {
      const audit = useRecentAudit();
      if (audit.isPending) return null;
      // Repeats in a row (the same person doing the same thing) count as one line.
      const groups: { actor: string; action: string; at: string; times: number }[] = [];
      for (const e of audit.data ?? []) {
        const actor = e.actor ?? "The system";
        const last = groups[groups.length - 1];
        if (last && last.actor === actor && last.action === e.action) last.times += 1;
        else groups.push({ actor, action: e.action, at: e.created_at, times: 1 });
      }
      const list = groups.slice(0, 3);
      if (!list.length) return { text: "Nothing has changed recently." };
      const parts = list.map((g) => {
        const did = ACTION_WORDS[g.action] ?? g.action.replace(/[._]/g, " ");
        const times = g.times > 1 ? ` ${g.times} times, the latest` : "";
        return `${g.actor} ${did}${times} ${relativeTime(g.at)}`;
      });
      return { text: `${parts.join("; ")}.`, link: { href: "/manage/audit", label: "Open audit log" } };
    },
  },
];

export const QUESTIONS_BY_ROLE: Record<Role, Question[]> = { student: STUDENT, teacher: TEACHER, admin: ADMIN };

export const HELLO_BY_ROLE: Record<Role, string> = {
  student: "Tap me if you have a question.",
  teacher: "Need a hand with your classes?",
  admin: "Want a quick look at the college?",
};
