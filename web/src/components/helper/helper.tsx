"use client";

import { type AvatarHandle, createAvatar } from "@bible-strong/avatar-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";
import character from "@/components/landing/guide.avatar.json";
import { useTheme } from "@/components/theme-provider";
import { useUnreadTotal } from "@/lib/chat";
import { useMe } from "@/lib/queries";
import { guideColours } from "@/lib/theme";
import type { Me } from "@/lib/types";
import { type Answer, HELLO_BY_ROLE, type Question, QUESTIONS_BY_ROLE, type Role } from "./answers";
import s from "./helper.module.css";

/*
 * The guide inside the app. It waits in a corner, calm, its eyes on your pointer; tapped, it asks
 * what you want to know and answers from your own data, with questions for your role. It reacts as
 * the app is used: a nod when you change page, a bounce for a new message, a doze when nobody is
 * around. Admins turn it on or off in Manage → Theme; anyone can close its panel.
 */

/**
 * States of its own, made only of the catalogue's calm clips: the built-in "idle" and "curious"
 * spin the avatar all the way round now and then, which is too much for a corner of the app.
 */
const LIBRARY = {
  clips: [],
  faces: [],
  states: [
    { name: "calm", clips: ["Idle_B", "Idle_D", "Idle_B"] },
    { name: "attentive", clips: ["Idle_D"], face: "inspecting" },
  ],
};

/** Admins first (they may also teach), then anyone who teaches, then students. */
function roleOf(me: Me | undefined): Role {
  if (!me) return "student";
  if (me.roles.includes("institution_admin")) return "admin";
  if (me.kind === "teacher" || me.sections.some((sec) => sec.teaching)) return "teacher";
  return "student";
}

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

type GuideComponent = ReturnType<typeof createAvatar>;

const DOZE_AFTER_MS = 90_000;

export default function Helper() {
  const { site } = useTheme();
  if (!site.helper_enabled) return null;
  return <HelperInner />;
}

function HelperInner() {
  const { site } = useTheme();
  const me = useMe().data;
  const role = roleOf(me);
  const name = site.guide_name || "Verse";
  const Guide = useGuide(name, guideColours(site));
  const avatar = useRef<AvatarHandle>(null);
  const pathname = usePathname();
  const unread = useUnreadTotal();

  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const [asleep, setAsleep] = useState(false);
  // A short reaction (a state for a moment) that wins over everything else.
  const [reaction, setReaction] = useState<string | null>(null);
  const reactTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const react = useCallback((state: string, ms = 1800) => {
    clearTimeout(reactTimer.current);
    setReaction(state);
    reactTimer.current = setTimeout(() => setReaction(null), ms);
  }, []);
  const say = useCallback((text: string, ms = 5000) => {
    clearTimeout(bubbleTimer.current);
    setBubble(text);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);
  useEffect(
    () => () => {
      clearTimeout(reactTimer.current);
      clearTimeout(bubbleTimer.current);
    },
    [],
  );

  const firstName = me?.preferred_name || me?.first_name || "there";

  // A hello once per visit.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("cv-helper-hello") === "1";
      sessionStorage.setItem("cv-helper-hello", "1");
    } catch {
      // Storage blocked: just say hello.
    }
    if (seen || !me) return;
    const t = setTimeout(() => {
      react("happy", 2500);
      say(`Hi ${firstName}! ${HELLO_BY_ROLE[role]}`, 7000);
    }, 1200);
    return () => clearTimeout(t);
    // Once, when we know who it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(me)]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // A new message: a bounce and a word about it.
  const lastUnread = useRef(unread);
  useEffect(() => {
    if (unread > lastUnread.current && !open) {
      react("excited", 2600);
      avatar.current?.poke("bounce");
      say(unread - lastUnread.current === 1 ? "New message!" : `${unread - lastUnread.current} new messages!`);
    }
    lastUnread.current = unread;
  }, [unread, open, react, say]);

  // A small nod at every new page.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== lastPath.current) avatar.current?.poke("nod");
    lastPath.current = pathname;
  }, [pathname]);

  // Dozes when nobody is around; wakes, surprised, when someone is back.
  useEffect(() => {
    let timer = setTimeout(() => setAsleep(true), DOZE_AFTER_MS);
    let sleeping = false;
    const onActivity = () => {
      clearTimeout(timer);
      if (sleeping) {
        sleeping = false;
        setAsleep(false);
        react("surprised", 1400);
      }
      timer = setTimeout(() => {
        sleeping = true;
        setAsleep(true);
      }, DOZE_AFTER_MS);
    };
    const events = ["pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [react]);

  // Five quick taps: it laughs.
  const taps = useRef<number[]>([]);
  const onTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      react("laughing", 2200);
      say("Hehe, that tickles!", 2500);
      return;
    }
    avatar.current?.poke("bounce");
    setOpen((o) => !o);
    setBubble(null);
  };

  const state = reaction ?? (open ? "attentive" : asleep ? "sleeping" : "calm");

  return (
    <aside className={s.helper} aria-label={`${name}, your guide`}>
      {open && (
        <AskPanel
          key={role}
          name={name}
          firstName={firstName}
          questions={QUESTIONS_BY_ROLE[role]}
          onClose={() => setOpen(false)}
          onAnswer={(a) => react(a.mood ?? "happy", 2600)}
          Guide={Guide}
          followPointer={!phone}
        />
      )}
      {!open && bubble && (
        <p className={s.hello} role="status">
          {bubble}
        </p>
      )}
      <button
        type="button"
        className={s.avatar}
        onClick={onTap}
        onPointerEnter={() => avatar.current?.poke("nod")}
        aria-expanded={open}
        aria-label={open ? `Close ${name}` : `Ask ${name} a question`}
      >
        <Guide
          ref={avatar}
          library={LIBRARY}
          state={state}
          // Its eyes follow your pointer (on a phone there is none to follow).
          followPointer={!phone}
          size={phone ? 52 : 64}
        />
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
  questions,
  onClose,
  onAnswer,
  Guide,
  followPointer,
}: {
  name: string;
  firstName: string;
  questions: Question[];
  onClose: () => void;
  onAnswer: (a: Answer) => void;
  Guide: GuideComponent;
  followPointer: boolean;
}) {
  // Each asking gets its own key, so a question asked again is looked up again.
  const [asked, setAsked] = useState<{ q: Question; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<string | null>(null);

  return (
    <div className={s.panel} role="dialog" aria-label={`Ask ${name}`}>
      <div className={s.panelHead}>
        <span className={s.panelFace} aria-hidden="true">
          <Guide
            library={LIBRARY}
            state={busy ? "thinking" : asked ? (mood ?? "happy") : "attentive"}
            followPointer={followPointer}
            size={40}
          />
        </span>
        <p className={s.panelTitle}>{asked ? asked.q.ask : `Hi ${firstName}! What do you want to know?`}</p>
        <button type="button" className={s.close} onClick={onClose} aria-label={`Close ${name}`}>
          <CloseIcon className="size-4" />
        </button>
      </div>

      {asked && (
        <ReplyView
          key={asked.n}
          question={asked.q}
          name={name}
          onBusy={setBusy}
          onReady={(a) => {
            setMood(a.mood ?? "happy");
            onAnswer(a);
          }}
          onFollow={onClose}
        />
      )}

      <div className={s.chips}>
        {questions
          .filter((q) => q.id !== asked?.q.id)
          .map((q) => (
            <button
              key={q.id}
              type="button"
              className={s.chip}
              onClick={() => {
                setMood(null);
                setAsked((a) => ({ q, n: (a?.n ?? 0) + 1 }));
              }}
            >
              {q.ask}
            </button>
          ))}
      </div>
    </div>
  );
}

/** Asks one question: shows the guide thinking for a moment, then the answer and its link. */
function ReplyView({
  question,
  name,
  onBusy,
  onReady,
  onFollow,
}: {
  question: Question;
  name: string;
  onBusy: (busy: boolean) => void;
  onReady: (a: Answer) => void;
  onFollow: () => void;
}) {
  const reply = question.useReply({ name });
  // Picked once per asking (tips are random), not on every render.
  const [fixed, setFixed] = useState(reply);
  const [thinking, setThinking] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setThinking(false), 700);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!fixed && reply) setFixed(reply);
  }, [reply, fixed]);

  const busy = thinking || !fixed;
  useEffect(() => onBusy(busy), [busy, onBusy]);
  const told = useRef(false);
  useEffect(() => {
    if (!busy && fixed && !told.current) {
      told.current = true;
      onReady(fixed);
    }
  }, [busy, fixed, onReady]);

  return (
    <div className={s.answer} aria-live="polite">
      {busy ? (
        <span className={s.dots} aria-label="Looking it up">
          <span />
          <span />
          <span />
        </span>
      ) : (
        fixed && (
          <>
            <p>{fixed.text}</p>
            {fixed.link && (
              <Link href={fixed.link.href} onClick={onFollow} className={s.answerLink}>
                {fixed.link.label}
              </Link>
            )}
          </>
        )
      )}
    </div>
  );
}
