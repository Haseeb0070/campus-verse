"use client";

import { createAvatar } from "@bible-strong/avatar-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CloseIcon } from "@/components/icons";
import character from "@/components/landing/guide.avatar.json";
import { useTheme } from "@/components/theme-provider";
import { useUnreadTotal } from "@/lib/chat";
import { relativeTime, startsLabel, todayIn } from "@/lib/format";
import { useAssignments, useMe, useNextClass, useNotices } from "@/lib/queries";
import { guideColours } from "@/lib/theme";
import s from "./helper.module.css";

/*
 * The guide inside the app. It waits in a corner; tapped, it asks what you want to know and
 * answers from your own timetable, coursework, notices and chats. Admins turn it on or off in
 * Manage → Theme; anyone can close its panel.
 */

type Answer = { text: string; link?: { href: string; label: string } };
type Question = { id: string; ask: string };

const QUESTIONS: Question[] = [
  { id: "next", ask: "What’s my next class?" },
  { id: "due", ask: "Anything due soon?" },
  { id: "notices", ask: "Any new notices?" },
  { id: "unread", ask: "Unread messages?" },
  { id: "tip", ask: "Give me a study tip" },
  { id: "who", ask: "Who are you?" },
];

const TIPS = [
  "Study in 25-minute blocks with a 5-minute break. After four, take a longer one.",
  "Explain today’s lecture to a friend in your section chat. If you can teach it, you know it.",
  "Write tomorrow’s first task before you close your notes tonight. Starting is the hard part.",
  "Put your phone in another room for one focused hour. You’ll be surprised.",
  "Redo one solved problem without looking. That beats reading the solution three times.",
  "Sleep is study too: memories settle while you rest.",
];

function useGuide(name: string, colours: { body: string; cap: string; tassel: string }) {
  return useMemo(() => {
    const [base, board, tassel] = character.body.nodes;
    return createAvatar({
      ...character,
      name,
      colors: { ...character.colors, body: colours.body },
      body: {
        ...character.body,
        nodes: [
          { ...base, color: colours.cap },
          { ...board, color: colours.cap },
          { ...tassel, color: colours.tassel },
        ],
      },
    });
  }, [name, colours.body, colours.cap, colours.tassel]);
}

export default function Helper() {
  const { site } = useTheme();
  if (!site.helper_enabled) return null;
  return <HelperInner />;
}

function HelperInner() {
  const { site } = useTheme();
  const me = useMe().data;
  const name = site.guide_name || "Verse";
  const Guide = useGuide(name, guideColours(site));
  const [open, setOpen] = useState(false);
  const [hello, setHello] = useState(false);
  const [phone, setPhone] = useState(false);

  // A hello once per visit, then it waits quietly.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("cv-helper-hello") === "1";
      sessionStorage.setItem("cv-helper-hello", "1");
    } catch {
      // Storage blocked: just say hello.
    }
    if (seen) return;
    const show = setTimeout(() => setHello(true), 1200);
    const hide = setTimeout(() => setHello(false), 8000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const firstName = me?.preferred_name || me?.first_name || "there";

  return (
    <aside className={s.helper} aria-label={`${name}, your guide`}>
      {open && <AskPanel name={name} firstName={firstName} onClose={() => setOpen(false)} Guide={Guide} />}
      {!open && hello && (
        <p className={s.hello} role="status">
          Hi {firstName}! Tap me if you have a question.
        </p>
      )}
      <button
        type="button"
        className={s.avatar}
        onClick={() => {
          setOpen((o) => !o);
          setHello(false);
        }}
        aria-expanded={open}
        aria-label={open ? `Close ${name}` : `Ask ${name} a question`}
      >
        <Guide state={open ? "curious" : hello ? "happy" : "idle"} size={phone ? 52 : 64} settleAfterMs={open ? 0 : 6000} />
        {!open && (
          <span className={s.badge} aria-hidden="true">
            ?
          </span>
        )}
      </button>
    </aside>
  );
}

function AskPanel({
  name,
  firstName,
  onClose,
  Guide,
}: {
  name: string;
  firstName: string;
  onClose: () => void;
  Guide: ReturnType<typeof createAvatar>;
}) {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const next = useNextClass();
  const assignments = useAssignments();
  const notices = useNotices(5);
  const unread = useUnreadTotal();
  const [asked, setAsked] = useState<Question | null>(null);
  const [thinking, setThinking] = useState(false);

  // A moment to think before answering: it reads as the guide looking things up.
  useEffect(() => {
    if (!asked) return;
    setThinking(true);
    const t = setTimeout(() => setThinking(false), 700);
    return () => clearTimeout(t);
  }, [asked]);

  const answer = (q: Question): Answer | null => {
    switch (q.id) {
      case "next": {
        if (next.isPending) return null;
        const c = next.data;
        if (!c) return { text: "Nothing on your timetable for the next few weeks. Enjoy the quiet!", link: { href: "/timetable", label: "Open timetable" } };
        const when = startsLabel(c.date, c.starts_at, todayIn(tz), tz);
        const who = c.teachers.length ? ` with ${c.teachers.join(" and ")}` : "";
        const where = c.mode === "online" ? "online" : `in ${c.room}`;
        return {
          text: `${c.course_title} (${c.course_code}). ${when}, ${where}${who}.`,
          link: { href: "/timetable", label: "Open timetable" },
        };
      }
      case "due": {
        if (assignments.isPending) return null;
        const now = Date.now();
        const open = (assignments.data ?? [])
          .filter((a) => a.status === "published" && new Date(a.due_at).getTime() > now)
          .filter((a) => !(a.my_submissions && a.my_submissions.length > 0))
          .sort((a, b) => a.due_at.localeCompare(b.due_at));
        if (!open.length) return { text: "Nothing due right now. You’re all caught up!", link: { href: "/assignments", label: "See coursework" } };
        const first = open[0];
        const more = open.length > 1 ? ` And ${open.length - 1} more after that.` : "";
        return {
          text: `${first.title} for ${first.course_code} is due ${relativeTime(first.due_at)}.${more}`,
          link: { href: `/assignments/${first.id}`, label: "Open it" },
        };
      }
      case "notices": {
        if (notices.isPending) return null;
        const list = notices.data ?? [];
        if (!list.length) return { text: "No notices yet. I’ll be here when one arrives.", link: { href: "/notices", label: "Open notices" } };
        const latest = list[0];
        const important = list.filter((n) => n.priority === "important").length;
        const when = latest.published_at ? `, ${relativeTime(latest.published_at)}` : "";
        const flag = important ? ` ${important} of the latest ${list.length} ${important === 1 ? "is" : "are"} marked important.` : "";
        return {
          text: `The newest is “${latest.title}” from ${latest.author_name}${when}.${flag}`,
          link: { href: "/notices", label: "Open notices" },
        };
      }
      case "unread":
        return unread
          ? { text: `You have ${unread} unread ${unread === 1 ? "message" : "messages"}.`, link: { href: "/chat", label: "Open chat" } }
          : { text: "No unread messages. Your chats are all read.", link: { href: "/chat", label: "Open chat" } };
      case "tip":
        return { text: TIPS[Math.floor(Math.random() * TIPS.length)] };
      case "who":
        return {
          text: `I’m ${name}, CampusVerse’s guide. Ask me about your classes, coursework, notices or messages, and I’ll look them up for you.`,
        };
      default:
        return null;
    }
  };

  // The tip is picked once per asking, not on every render.
  const [tipAnswer, setTipAnswer] = useState<Answer | null>(null);
  const reply = asked ? (asked.id === "tip" ? tipAnswer : answer(asked)) : null;
  const busy = thinking || (asked !== null && reply === null);

  return (
    <div className={s.panel} role="dialog" aria-label={`Ask ${name}`}>
      <div className={s.panelHead}>
        <span className={s.panelFace} aria-hidden="true">
          <Guide state={busy ? "thinking" : asked ? "happy" : "curious"} size={40} />
        </span>
        <p className={s.panelTitle}>
          {asked ? asked.ask : `Hi ${firstName}! What do you want to know?`}
        </p>
        <button type="button" className={s.close} onClick={onClose} aria-label={`Close ${name}`}>
          <CloseIcon className="size-4" />
        </button>
      </div>

      {asked && (
        <div className={s.answer} aria-live="polite">
          {busy ? (
            <span className={s.dots} aria-label="Looking it up">
              <span />
              <span />
              <span />
            </span>
          ) : (
            reply && (
              <>
                <p>{reply.text}</p>
                {reply.link && (
                  <Link href={reply.link.href} onClick={onClose} className={s.answerLink}>
                    {reply.link.label}
                  </Link>
                )}
              </>
            )
          )}
        </div>
      )}

      <div className={s.chips}>
        {QUESTIONS.filter((q) => q.id !== asked?.id).map((q) => (
          <button
            key={q.id}
            type="button"
            className={s.chip}
            onClick={() => {
              if (q.id === "tip") setTipAnswer(answer(q));
              setAsked(q);
            }}
          >
            {q.ask}
          </button>
        ))}
      </div>
    </div>
  );
}
