"use client";

import { type AvatarHandle, createAvatar } from "@bible-strong/avatar-react";
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";
import character from "./guide.avatar.json";
import s from "./guide.module.css";

/*
 * Verse, the landing page's guide: CampusVerse's own character (a terracotta ball in a graduation
 * cap), drawn by the MIT-licensed @bible-strong/avatar-react. It sits in the corner and, as the
 * page scrolls, plays a state and says one line about the section in view.
 */

const Verse = createAvatar(character);

type Stop = { id: string | null; state: string; line: string };

/** Each section of the page, top to bottom, with what Verse does and says there. */
const STOPS: Stop[] = [
  { id: null, state: "happy", line: "Salaam! I’m Verse. Scroll and I’ll show you around CampusVerse." },
  { id: "week", state: "reading", line: "This is BS CS G1+G2’s week. Tap a day to see its classes and rooms." },
  { id: "menu", state: "proud", line: "Students, teachers and the college office each get their own tools." },
  { id: "questions", state: "curious", line: "New here? Start with “How do I sign in?”." },
  { id: "signin", state: "excited", line: "Ready? Use your roll number @gcslahore.edu.pk." },
  { id: "end", state: "celebrate", line: "See you in R-127!" },
];

/** The last section whose top has passed the upper third of the screen (the top of the page when none). */
function useStop() {
  const [stop, setStop] = useState(0);
  useEffect(() => {
    const update = () => {
      const line = window.innerHeight * 0.4;
      let found = 0;
      STOPS.forEach(({ id }, i) => {
        const el = id ? document.getElementById(id) : null;
        if (el && el.getBoundingClientRect().top <= line) found = i;
      });
      // At the very bottom the footer may never reach the line: it is the last stop anyway.
      const atBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (atBottom && window.scrollY > 0) found = STOPS.length - 1;
      setStop(found);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return stop;
}

export default function Guide() {
  const stop = useStop();
  const avatar = useRef<AvatarHandle>(null);
  // The bubble can be put away; the avatar stays and brings it back.
  const [talking, setTalking] = useState(true);
  const [phone, setPhone] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const { id, state, line } = STOPS[stop];
  // On smaller screens the bubble would cover the sign-in card and the footer, which say the same
  // thing: there Verse keeps quiet and only plays.
  const quiet = narrow && (id === "signin" || id === "end");

  useEffect(() => {
    const mqPhone = window.matchMedia("(max-width: 720px)");
    const mqNarrow = window.matchMedia("(max-width: 1080px)");
    const on = () => {
      setPhone(mqPhone.matches);
      setNarrow(mqNarrow.matches);
    };
    on();
    mqPhone.addEventListener("change", on);
    mqNarrow.addEventListener("change", on);
    return () => {
      mqPhone.removeEventListener("change", on);
      mqNarrow.removeEventListener("change", on);
    };
  }, []);

  // A small nod each time Verse has something new to say.
  useEffect(() => {
    if (stop > 0) avatar.current?.poke("nod");
  }, [stop]);

  return (
    <aside className={s.guide} aria-label="Verse, your guide">
      {talking && !quiet && (
        <div className={s.bubble}>
          {/* Keyed so each new line fades in. */}
          <p key={stop} className={s.line} aria-live="polite">
            {line}
          </p>
          <button
            type="button"
            className={s.close}
            onClick={() => setTalking(false)}
            aria-label="Hide Verse’s tips"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}
      <button
        type="button"
        className={s.avatarButton}
        onClick={() => {
          setTalking((t) => !t);
          avatar.current?.poke("bounce");
        }}
        aria-label={talking ? "Verse: hide tips" : "Verse: show tips"}
        aria-expanded={talking}
      >
        <Verse
          ref={avatar}
          state={state}
          size={phone ? 64 : 88}
          followPointer={!phone}
          ariaLabel="Verse, the CampusVerse guide"
        />
      </button>
    </aside>
  );
}
