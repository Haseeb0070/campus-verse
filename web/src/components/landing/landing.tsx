"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { LogoGlyph } from "@/components/icons";
import BlurText from "@/components/reactbits/BlurText";
import { SignInDialog } from "@/components/sign-in-dialog";
import s from "./landing.module.css";

// The guide draws with window-only APIs, so it loads in the browser only.
const Guide = dynamic(() => import("./guide"), { ssr: false });

/*
 * The landing page is built as the college's own printed timetable sheet: a paper card on the
 * evergreen ground, the week as paper slips (one per day, the real BS CS G1+G2 classes), the features
 * as a printed menu, sign-in as a reply card and the footer as the back of the card.
 */

/** Opens the sign-in popup, optionally with an email filled in. */
const OpenSignIn = createContext<(email?: string) => void>(() => {});

function SignInButton({ className, children }: { className: string; children: React.ReactNode }) {
  const open = useContext(OpenSignIn);
  return (
    <button type="button" className={className} onClick={() => open()}>
      {children}
    </button>
  );
}

/** Adds `.in` to children marked `data-rise` the first time the section scrolls into view. */
function useRise<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add(s.armed);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add(s.in);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Landing({
  signIn,
  onSignInClose,
}: {
  signIn?: { email?: string; next?: string | null };
  onSignInClose?: () => void;
} = {}) {
  const [dialog, setDialog] = useState<{ open: boolean; email?: string }>({
    open: Boolean(signIn),
    email: signIn?.email,
  });
  return (
    <OpenSignIn.Provider value={(email) => setDialog({ open: true, email })}>
      <div className={s.page}>
        <NavBar />
        <main>
          <Hero />
          <Week />
          <Menu />
          <Questions />
          <Reply />
        </main>
        <Footer />
        <Guide />
        <SignInDialog
          open={dialog.open}
          email={dialog.email}
          next={signIn?.next}
          onClose={() => {
            setDialog({ open: false });
            onSignInClose?.();
          }}
        />
      </div>
    </OpenSignIn.Provider>
  );
}

/* ---------- Navigation bar ---------- */

const SECTIONS = [
  ["week", "Your week"],
  ["menu", "What it does"],
  ["questions", "Questions"],
] as const;

/** The section in the middle of the screen, for the bar to mark. */
function useCurrentSection() {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    // The last section whose top has passed the upper third of the screen; none at the very top.
    // Three measurements per scroll event, so it runs directly.
    const update = () => {
      const line = window.innerHeight * 0.35;
      let found: string | null = null;
      for (const [id] of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) found = id;
      }
      setCurrent(found);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return current;
}

/** A plain bar on the evergreen ground: the name, the page's sections and sign in. It stays at the
 *  top while the page scrolls. */
function NavBar() {
  const current = useCurrentSection();
  return (
    <header className={s.nav}>
      <Link href="/" className={s.wordmark} aria-label="CampusVerse home">
        <span className={s.wordmarkTile}>
          <LogoGlyph className="size-[60%]" />
        </span>
        CampusVerse
      </Link>
      <nav aria-label="On this page" className={s.navLinks}>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} aria-current={current === id ? "location" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <SignInButton className={`${s.button} ${s.navButton}`}>Sign in</SignInButton>
    </header>
  );
}

/* ---------- Hero: the card on its own ---------- */

const TITLE = ["Your college,", "on one screen."];

/** The headline drifts in word by word, like the app's page titles: the second line follows the
 *  first, and holds its space until then so nothing below it moves. */
function HeroTitle() {
  const [second, setSecond] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSecond(true), 260);
    return () => clearTimeout(t);
  }, []);
  const line = (text: string) => (
    <BlurText
      text={text}
      trigger="load"
      effect="drift"
      blur={10}
      distance={18}
      delay={110}
      stepDuration={0.55}
      className="justify-center"
    />
  );
  return (
    <h1 id="hero-title" className={s.display}>
      <span className={s.titleLine}>{line(TITLE[0])}</span>
      <span className={s.titleLine}>
        {second ? (
          line(TITLE[1])
        ) : (
          <span className={s.titleHold} aria-hidden="true">
            {TITLE[1]}
          </span>
        )}
      </span>
    </h1>
  );
}

function Hero() {
  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <div className={s.heroCard}>
        <div className={s.heroCardBody}>
          <HeroTitle />
          <p className={s.heroLead}>
            The class app of Govt. Graduate College of Science, Lahore: your timetable, room changes,
            notices, coursework and section chat, with your college email.
          </p>
          <div className={s.heroActions}>
            <SignInButton className={s.button}>Sign in</SignInButton>
            <a href="#week" className={s.textLink}>
              See this week
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- The week: one paper slip per day ---------- */

type Lecture = { title: string; code: string; teacher: string; room: string; colour: string };

const MON_WED: Lecture[] = [
  { title: "Artificial Intelligence", code: "CC-310", teacher: "Nabeel", room: "R-127", colour: "#8e5fb0" },
  { title: "Theory of Automata", code: "CC-320", teacher: "Sadaf", room: "R-127", colour: "#2a8c88" },
  { title: "Design and Analysis of Algorithms", code: "CC-313", teacher: "Nabeel", room: "R-127", colour: "#d9782d" },
];
const THU_SAT: Lecture[] = [
  { title: "Web Development", code: "EC-330", teacher: "Nabeel", room: "R-127", colour: "#4a7fb5" },
  { title: "Translation of the Holy Quran", code: "HQ-005", teacher: "Mati ur Rehman", room: "R-27", colour: "#b8902f" },
  { title: "Computer Architecture", code: "DC-322", teacher: "Rawa", room: "R-127", colour: "#6e685e" },
  { title: "Human-Computer Interaction", code: "DC-321", teacher: "Rawa", room: "R-127", colour: "#c9506d" },
];
const WEEK = [
  { day: "Monday", short: "Mon", classes: MON_WED },
  { day: "Tuesday", short: "Tue", classes: MON_WED },
  { day: "Wednesday", short: "Wed", classes: MON_WED },
  { day: "Thursday", short: "Thu", classes: THU_SAT },
  { day: "Friday", short: "Fri", classes: THU_SAT },
  { day: "Saturday", short: "Sat", classes: THU_SAT },
];

function daySummary(i: number) {
  const { day, classes } = WEEK[i];
  const rooms = [...new Set(classes.map((c) => c.room))];
  return `${day}: ${classes.length} classes, in ${rooms.join(" and ")}.`;
}

function Week() {
  const ref = useRise<HTMLElement>();
  // Opens on today (Sunday shows Monday). Set after mount so the server and browser agree.
  const [picked, setPicked] = useState(0);
  useEffect(() => {
    const d = new Date().getDay();
    setPicked(d === 0 ? 0 : d - 1);
  }, []);

  return (
    <section ref={ref} id="week" className={s.week} aria-labelledby="week-title">
      <div className={s.weekText}>
        <h2 id="week-title" className={s.title} data-rise>
          This week in R-127
        </h2>
        <p className={s.weekLead} data-rise>
          BS CS, 5th semester, G1 and G2 as one class. Monday to Wednesday has three classes and
          Thursday to Saturday four, all in R-127 except the Quran translation class in R-27.
        </p>
        <div className={s.dayPicker} role="group" aria-label="Pick a day" data-rise>
          {WEEK.map((d, i) => (
            <button
              key={d.day}
              type="button"
              aria-pressed={i === picked}
              onClick={() => setPicked(i)}
              className={s.dayButton}
            >
              {d.short}
            </button>
          ))}
        </div>
        <p className={s.srOnly} aria-live="polite">
          {daySummary(picked)}
        </p>
      </div>
      <ol className={s.slips} aria-label="The week, day by day">
        {WEEK.map((d, i) => (
          <li key={d.day} className={`${s.slipItem} ${i === picked ? s.slipItemPicked : ""}`}>
            <button
              type="button"
              className={`${s.slip} ${i === picked ? s.slipPicked : ""}`}
              onClick={() => setPicked(i)}
              aria-label={daySummary(i)}
            >
              <span className={s.slipDay}>{d.day}</span>
              <span className={s.slipCut} aria-hidden="true">
                - - - - - - - - - - - - - - -
              </span>
              {d.classes.map((c) => (
                <span key={c.code} className={s.slipClass}>
                  <span className={s.slipDot} style={{ background: c.colour }} aria-hidden="true" />
                  <span>
                    <b>{c.title}</b>
                    <span className={s.slipMeta}>
                      {c.code} · {c.teacher} · {c.room}
                    </span>
                  </span>
                </span>
              ))}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- What it does: a printed menu ---------- */

const MENU: { group: string; items: [string, string, string][] }[] = [
  {
    group: "For students",
    items: [
      ["Today", "first screen", "Your next class with its room, recent chats, due work and notices."],
      ["Timetable", "whole week", "Every class in order, with room changes as they happen."],
      ["Section chat", "live", "One chat per subject, with the teacher in it."],
      ["Assignments", "hand in online", "Upload files before the deadline and see what is marked."],
      ["Progress", "marks and attendance", "Released marks and attendance for every subject."],
    ],
  },
  {
    group: "For teachers",
    items: [
      ["Notices", "pinned", "Post to a section, pin what matters, schedule the rest."],
      ["Class changes", "one step", "Move, cancel or re-room a class; students are told."],
      ["Attendance", "per class", "Mark the class list from a phone in the room."],
    ],
  },
  {
    group: "For the college office",
    items: [
      ["Accounts", "by roll number", "Every student signs in with their roll number email."],
      ["Timetable import", "CSV or Excel", "Check every change before it goes out to everyone."],
    ],
  },
];

function Menu() {
  const ref = useRise<HTMLElement>();
  return (
    <section ref={ref} id="menu" className={s.menu} aria-labelledby="menu-title">
      <div className={s.sheet} data-rise>
        <h2 id="menu-title" className={s.title}>
          What it does
        </h2>
        {MENU.map(({ group, items }) => (
          <div key={group} className={s.menuGroup}>
            <h3 className={s.menuGroupName}>{group}</h3>
            <dl>
              {items.map(([name, value, text]) => (
                <div key={name} className={s.menuItem}>
                  <dt>
                    <span className={s.menuName}>{name}</span>
                    <span className={s.menuLeader} aria-hidden="true" />
                    <span className={s.menuValue}>{value}</span>
                  </dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className={s.menuScreens}>
        <figure data-rise>
          <Image
            src="/landing/gcs-notices.jpg"
            width={2880}
            height={1800}
            sizes="(max-width: 860px) 92vw, 48vw"
            alt="The notices board: Project groups due Friday pinned at the top, then Lab notes uploaded and Quiz moved to Thursday."
          />
          <figcaption>Notices from Nabeel and Rawa, the important one pinned.</figcaption>
        </figure>
        <figure data-rise>
          <Image
            src="/landing/gcs-chat.jpg"
            width={2880}
            height={1800}
            sizes="(max-width: 860px) 92vw, 48vw"
            alt="The EC-330 Web Development section chat: Zainab asks about React, Nabeel answers."
          />
          <figcaption>The EC-330 section chat, with Nabeel in it.</figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ---------- Questions, beside the phone ---------- */

const FACTS = [
  ["Students", "your-roll-number@gcslahore.edu.pk"],
  ["Teachers and staff", "the college email the office gave you"],
  ["On a phone", "any browser, no app to install"],
];

const FAQ: [string, string][] = [
  [
    "How do I sign in?",
    "Use your university roll number as your email, for example 126000@gcslahore.edu.pk, with the password the college gave you. Change the password after your first sign-in.",
  ],
  [
    "Can I message a teacher or a classmate privately?",
    "Yes, anyone you share a class with, and the college office. Your first message goes as a request; once they accept, you can both write freely. If they decline, you can't message them again.",
  ],
  [
    "Who can read the section chat and notices?",
    "Only the students and teachers of that section. Private chats are between the two of you; not even the college office can read them.",
  ],
  [
    "What happens when a class moves?",
    "The change is made once and everyone's timetable updates straight away. Anything that moved today also arrives as a notification.",
  ],
  [
    "Do I need to install anything?",
    "No. CampusVerse works in any phone or computer browser, with its own phone layout and the main tabs at the bottom.",
  ],
  [
    "I forgot my password.",
    "Ask the college office to reset it. If you turned on two-step sign-in, keep your recovery codes somewhere safe.",
  ],
];

function Questions() {
  const ref = useRise<HTMLElement>();
  return (
    <section ref={ref} id="questions" className={s.faq} aria-labelledby="faq-title">
      <div className={s.faqText}>
        <h2 id="faq-title" className={s.title} data-rise>
          Questions
        </h2>
        <dl className={s.facts} data-rise>
          {FACTS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className={s.faqList} data-rise>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span className={s.chevron} aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <SignInButton className={s.button}>Sign in</SignInButton>
      </div>
      <div className={s.faqPictures} data-rise>
        <Image
          src="/landing/gcs-phone.jpg"
          width={780}
          height={1688}
          sizes="(max-width: 860px) 70vw, 30vw"
          className={s.faqPhone}
          alt="CampusVerse on a phone: Today with tomorrow's Web Development class in R-127."
        />
      </div>
    </section>
  );
}

/* ---------- Sign in: the reply card ---------- */

function Reply() {
  const ref = useRise<HTMLElement>();
  return (
    <section ref={ref} id="signin" className={s.reply} aria-labelledby="reply-title">
      <p className={s.replyNote} data-rise>
        Your classes, notices and section chats are already in it. Sign in once and keep it open on
        your phone.
      </p>
      <div className={s.replyCard} data-rise>
        <h2 id="reply-title" className={s.title}>
          Sign in
        </h2>
        <p>
          Students: your roll number @gcslahore.edu.pk.
          <br />
          Teachers and staff: your college email.
        </p>
        <SignInButton className={`${s.button} ${s.buttonBar}`}>Sign in to CampusVerse</SignInButton>
      </div>
    </section>
  );
}

/* ---------- Footer: the back of the card ---------- */

function Footer() {
  return (
    <footer id="end" className={s.footer}>
      <div className={s.back}>
        <div className={s.scallops} aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className={s.backMessage}>
          <p className={s.title}>See you in R-127.</p>
          <p>
            CampusVerse is the class app for BS CS (G1+G2) at Govt. Graduate College of Science. Built
            for the college&apos;s students, teachers and office.
          </p>
        </div>
        <div className={s.backAddress}>
          <Image
            src="/landing/gcs-phone.jpg"
            width={780}
            height={1688}
            sizes="88px"
            className={s.stamp}
            alt=""
          />
          <address>
            <span>Govt. Graduate College of Science</span>
            <span>Wahdat Road, Lahore</span>
            <SignInButton className={s.linkButton}>Sign in</SignInButton>
            <a href="#questions">Questions</a>
          </address>
        </div>
        <p className={s.imprint}>© {new Date().getFullYear()} CampusVerse</p>
      </div>
    </footer>
  );
}
