"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, LogoMark } from "@/components/icons";
import { Pushpin } from "@/components/pushpin";
import AnimatedContent from "@/components/reactbits/AnimatedContent";
import BlurText from "@/components/reactbits/BlurText";
import s from "./landing.module.css";

/** Entrance for the parts of a section: rises a little and fades in as it scrolls into view. */
function Rise({
  children,
  delay = 0,
  stagger = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  stagger?: number;
  className?: string;
}) {
  return (
    <AnimatedContent distance={24} duration={0.7} delay={delay} stagger={stagger} threshold={0.15} className={className}>
      {children}
    </AnimatedContent>
  );
}

/** A section title that settles in word by word (React Bits BlurText). */
function Title({ text, id, className = "" }: { text: string; id?: string; className?: string }) {
  return (
    <h2 id={id} className={`${s.title} ${className}`}>
      <BlurText text={text} trigger="view" effect="drift" blur={4} distance={10} delay={60} stepDuration={0.4} />
    </h2>
  );
}

export function Landing() {
  return (
    <div className={s.page}>
      {/* Content that animates in starts hidden; without scripts, show it. */}
      <noscript>
        <style>{`.invisible{visibility:visible!important}`}</style>
      </noscript>
      <Header />
      <main>
        <Hero />
        <Showcase />
        <Features />
        <HowItWorks />
        <Roles />
        <Questions />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className={s.header} style={{ position: "absolute" }}>
      <Link href="/" className={s.wordmark} aria-label="CampusVerse home">
        <span className={s.wordmarkTile}>
          <LogoMark className="size-5" />
        </span>
        CampusVerse
      </Link>
      <nav aria-label="Sections" className={s.navLinks}>
        <a href="#what">What it does</a>
        <a href="#timetables">Timetables</a>
        <a href="#who">Who it&apos;s for</a>
        <a href="#questions">Questions</a>
      </nav>
      <Link href="/sign-in" className={s.button}>
        Sign in
      </Link>
    </header>
  );
}

/* ---------- Hero ---------- */

function Hero() {
  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <div className={s.heroTop} />
      <div className={s.heroBottom} />
      <h1 id="hero-title" className={`${s.display} ${s.heroHeadline}`}>
        <span className={`${s.line} ${s.lineInk}`}>Your campus,</span>
        <span className={`${s.line} ${s.linePaper}`}>
          <span className={s.slot} aria-label="your 08:30 class in room A-112,">
            <span className={s.slotDot} aria-hidden="true" />
            <span aria-hidden="true">08:30</span>
            <span className={s.slotRoom} aria-hidden="true">· A-112</span>
          </span>
          up next.
        </span>
      </h1>
      <div className={s.heroSupport}>
        <p style={{ margin: 0 }}>
          CampusVerse is the academic home for your university: timetables and room changes, notices, coursework,
          attendance and live section chat, for students, teachers and staff.
        </p>
        <div className={s.heroActions}>
          <Link href="/sign-in" className={`${s.button} ${s.buttonPaper}`}>
            Sign in
          </Link>
          <a href="#what" className={`${s.button} ${s.heroGhost}`}>
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- Showcase: the Today screen at three distances ---------- */

const STAGES = [
  {
    zoom: 1,
    origin: "50% 50%",
    caption: "Today opens with your next class, your recent chats, what is due and the latest notices.",
  },
  {
    zoom: 1.9,
    origin: "42% 21%",
    caption: "The next-class card counts down, shows the room and opens the section chat in one tap.",
  },
  {
    zoom: 2.2,
    origin: "100% 100%",
    caption: "Notices from teachers and the department land here first, pinned until they stop mattering.",
  },
];

function Showcase() {
  const [step, setStep] = useState(0);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    markers.current.forEach((m) => m && io.observe(m));
    return () => io.disconnect();
  }, []);
  const stage = STAGES[step];
  return (
    <section id="what" className={s.showcase} aria-labelledby="showcase-title">
      <div className={s.heroTail} aria-hidden="true" />
      <div className={s.markers} aria-hidden="true">
        {STAGES.map((_, i) => (
          <div key={i} data-step={i} ref={(el) => void (markers.current[i] = el)} />
        ))}
      </div>
      <div className={s.stage} data-step={step + 1}>
        <h2 id="showcase-title" className={s.stageHeading}>
          <span className={`${s.title} ${s.stageTitleTop}`}>One screen</span>
          <span className={`${s.title} ${s.stageTitleBottom}`}> for the whole day</span>
        </h2>
        <div className={s.screen} style={{ ["--zoom" as string]: stage.zoom, ["--ox" as string]: stage.origin.split(" ")[0], ["--oy" as string]: stage.origin.split(" ")[1] }}>
          <Image
            src="/landing/today.jpg"
            width={2880}
            height={1800}
            sizes="(max-width: 860px) 92vw, 52vw"
            alt="The CampusVerse Today screen: the next class, Linear Algebra at 08:30 in A-112, with recent chats, due work and notices."
          />
        </div>
        <p className={s.stageCaption} aria-live="polite">
          <span key={step}>{stage.caption}</span>
        </p>
      </div>
    </section>
  );
}

/* ---------- Features: a paragraph with pictures for words ---------- */

/** A small real piece of the app, set inline at the size of a word. */
function Chip({ kind, children }: { kind: "pin" | "bubble" | "graded" | "attendance"; children: React.ReactNode }) {
  return (
    <span className={`${s.chip} ${s[kind]}`} data-ui>
      {kind === "pin" && <Pushpin className={s.chipPin} />}
      {children}
    </span>
  );
}

function Features() {
  return (
    <section className={s.features} aria-labelledby="features-title">
      <h2 id="features-title" className={s.srOnly}>
        What it does
      </h2>
      <Rise>
        <p className={`${s.statement} ${s.featuresText}`}>
          Notices pin to a board <Chip kind="pin">Important</Chip> so they stay seen. Each section has its own live chat{" "}
          <Chip kind="bubble">Iterative is fine.</Chip> Coursework shows what is marked <Chip kind="graded">Graded 18.5/20</Chip>{" "}
          and progress keeps attendance <Chip kind="attendance">100%</Chip> beside your marks.
        </p>
      </Rise>
      <div className={s.featuresFoot}>
        <Rise delay={0.1}>
          <p>
            Search finds any notice, course, file or event you are allowed to see, and nothing you are not. The calendar holds
            exams and events with sign-ups and waitlists, and notifications reach you in the app and by email.
          </p>
          <Link href="/sign-in" className={s.button}>
            Open CampusVerse
          </Link>
        </Rise>
      </div>
      <Rise stagger={0.08} className={s.featuresPair}>
        <figure>
          <Image
            src="/landing/notices.jpg"
            width={2880}
            height={1800}
            sizes="(max-width: 860px) 92vw, 46vw"
            alt="The Notices pinboard: important notices pinned at the top, the latest underneath."
          />
          <figcaption>The notices pinboard: important first, everything else underneath.</figcaption>
        </figure>
        <figure>
          <Image
            src="/landing/chat.jpg"
            width={2880}
            height={1800}
            sizes="(max-width: 860px) 92vw, 46vw"
            alt="The CS-301 section chat, with a student question and the teacher's answer."
          />
          <figcaption>Section chat: a question at night, the teacher&apos;s answer by morning.</figcaption>
        </figure>
      </Rise>
    </section>
  );
}

/* ---------- How it works: from the university's file to everyone's timetable ---------- */

const STEPS = [
  {
    name: "Upload",
    title: "Upload the timetable",
    body: "Staff upload the timetable as a CSV or Excel file, or connect a feed that is fetched on a schedule. People and enrolment lists come in the same way.",
  },
  {
    name: "Check",
    title: "Check every change",
    body: "A dry run shows what is new, what moved and what clashes, row by row. Nothing changes until someone says so, and nothing is ever deleted.",
  },
  {
    name: "Apply",
    title: "Apply in one step",
    body: "One button applies the whole file. The audit log records who applied it and when, and the run can be compared with the next one.",
  },
  {
    name: "Live",
    title: "Everyone sees it",
    body: "Students and teachers see the new room or time straight away, with a notification for anything that moved today.",
  },
];

function Fragment({ step }: { step: number }) {
  if (step === 0)
    return (
      <>
        <p className={s.uiTitle}>Imports &amp; sync</p>
        <div className={s.uiTabs} aria-hidden="true">
          <span>Timetable</span>
          <span>People</span>
          <span>Enrollment</span>
        </div>
        <div className={s.uiFile}>
          <span className={s.uiFileIcon}>XLSX</span>
          <span>
            fall-2026-timetable.xlsx
            <span className={s.uiMuted} style={{ display: "block" }}>
              214 rows · lecture, day, time, room, teacher
            </span>
          </span>
        </div>
        <div className={s.uiRow}>
          <span className={s.uiMuted}>Matched by course, section, day and start time</span>
          <span className={s.uiButton}>Preview import</span>
        </div>
      </>
    );
  if (step === 1)
    return (
      <>
        <p className={s.uiTitle}>Dry run · nothing changed yet</p>
        <div className={s.uiStats}>
          {[
            ["Rows read", 214],
            ["New", 6],
            ["Updates", 3],
            ["Unchanged", 205],
            ["Errors", 0],
            ["Room clashes", 1],
          ].map(([label, n]) => (
            <span key={label} className={s.uiStat}>
              {label}
              <b>{n}</b>
            </span>
          ))}
        </div>
        <div className={s.uiChange}>
          <b>CS-301 · 3B</b> Tuesday 10:30
          <span className={s.uiMuted} style={{ display: "block" }}>
            Room B-204 → B-210 · Imran Saleem
          </span>
        </div>
      </>
    );
  if (step === 2)
    return (
      <>
        <p className={s.uiTitle}>Apply 9 changes?</p>
        <p className={s.uiMuted} style={{ margin: "0 0 14px" }}>
          6 new classes and 3 updates. 205 classes stay as they are.
        </p>
        <div className={s.uiDone}>
          <CheckIcon className="size-5" /> Applied · 9 classes updated
        </div>
        <p className={s.uiMuted} style={{ margin: "12px 0 0" }}>
          Recorded in the audit log by Nadia Qureshi
        </p>
      </>
    );
  return (
    <>
      <p className={s.uiTitle}>Tuesday, Nov 24</p>
      <div className={s.uiClass}>
        <span className={s.uiClassBar} />
        <span>
          <b>10:30</b> Data Structures <span className={s.uiBadge}>Room changed</span>
          <span className={s.uiMuted} style={{ display: "block" }}>
            CS-301 · 3B · Lecture · B-210 · 10:30–11:50
          </span>
        </span>
      </div>
      <div className={s.uiToast}>Data Structures on Tuesday moved to room B-210.</div>
    </>
  );
}

function HowItWorks() {
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);
  const [fading, setFading] = useState(false);
  // A short crossfade between states of the fragment.
  useEffect(() => {
    if (step === shown) return;
    setFading(true);
    const t = setTimeout(() => {
      setShown(step);
      setFading(false);
    }, 160);
    return () => clearTimeout(t);
  }, [step, shown]);
  const current = STEPS[shown];
  return (
    <section id="timetables" className={s.how} aria-labelledby="how-title">
      <div className={s.howText}>
        <h2 id="how-title" className={`${s.title} ${s.howTitle}`} aria-live="polite">
          {current.title}
        </h2>
        <p className={s.howBody}>{current.body}</p>
      </div>
      <div className={s.howUi}>
        <div className={`${s.ui} ${fading ? s.uiFade : ""}`} data-ui>
          <Fragment step={shown} />
        </div>
      </div>
      <div className={s.howControls}>
        <div className={s.rangeWrap}>
          <span className={s.track} aria-hidden="true" />
          <span className={s.trackFill} style={{ width: `${(step / 3) * 100}%` }} aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            className={s.range}
            aria-label="Import stage"
            aria-valuetext={`${STEPS[step].name}: ${STEPS[step].title}`}
          />
        </div>
        <div className={s.stops}>
          {STEPS.map((st, i) => (
            <button key={st.name} type="button" onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}>
              {st.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Who it's for ---------- */

const ROLES: [string, string, string][] = [
  ["Students", "Today", "Next class, due work and notices"],
  ["Students", "Timetable", "The week, with room changes"],
  ["Students", "Assignments", "Hand in files before the deadline"],
  ["Students", "Progress", "Released marks and attendance"],
  ["Teachers", "Notices", "Pin, schedule and send to a section"],
  ["Teachers", "Class changes", "Move, cancel or re-room a class"],
  ["Teachers", "Attendance", "Mark a class in a minute"],
  ["Teachers", "Grading", "Mark hand-ins, release when ready"],
  ["Staff", "People", "Invites, roles and deactivation"],
  ["Staff", "Imports & sync", "Timetable, people and enrolment files"],
  ["Staff", "Reports", "Counts and rates, never who did what"],
  ["Staff", "Audit log", "Every change, kept for good"],
  ["Everyone", "Chat", "Sections and one-to-one messages"],
  ["Everyone", "Calendar", "Events, sign-ups and waitlists"],
];

function Roles() {
  return (
    <section id="who" className={s.roles} aria-labelledby="who-title">
      <Title id="who-title" text="Built for every desk on campus" className={s.rolesTitle} />
      <div className={s.rolesGrid}>
        <Rise className={s.rolesPhoto}>
          <figure style={{ margin: 0 }}>
            <Image
              src="/landing/classroom-archive.jpg"
              width={1024}
              height={762}
              sizes="(max-width: 860px) 64vw, 38vw"
              alt="A university geology room in the mid-twentieth century: display cases, tall windows and a pinned notice board."
            />
            <figcaption>The notice board has always been where a campus talks to itself.</figcaption>
          </figure>
        </Rise>
        <table className={s.rolesTable}>
          <caption>What each person can do</caption>
          <tbody>
            {ROLES.map(([who, tool, what], i) => {
              const first = i === 0 || ROLES[i - 1][0] !== who;
              return (
                <tr key={tool + who} className={first && i > 0 ? s.groupStart : undefined}>
                  <th scope="row">{first ? who : <span className={s.srOnly}>{who}</span>}</th>
                  <td>{tool}</td>
                  <td>{what}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- Questions ---------- */

const FAQ: [string, string][] = [
  [
    "Who can sign up?",
    "Nobody signs themselves up. Your institution creates accounts by invite or import, and gives each person the role they need.",
  ],
  [
    "Does it work on a phone?",
    "Yes. CampusVerse runs in any phone browser with its own phone layout: four tabs at the bottom and everything else under More.",
  ],
  [
    "Who can see a notice or a file?",
    "Only the people it was sent to: a section, a course, a department or the whole campus. Search follows the same rule.",
  ],
  [
    "Is the chat really live?",
    "Messages, typing and who is online arrive as they happen. If the live line drops, messages still arrive within a few seconds.",
  ],
  [
    "Where does the timetable come from?",
    "From the university's own CSV or Excel file, or a scheduled feed. Every change is shown before it is applied, and nothing is ever deleted.",
  ],
  [
    "How are accounts protected?",
    "Passwords are stored hashed, sign-in attempts are rate limited, and anyone can turn on two-step sign-in with an authenticator app and recovery codes.",
  ],
];

function Questions() {
  return (
    <section id="questions" className={s.faq} aria-labelledby="faq-title">
      <Title id="faq-title" text="Questions people ask" />
      <Rise stagger={0.06} className={s.faqList}>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <span className={s.chevron} aria-hidden="true" />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </Rise>
    </section>
  );
}

/* ---------- Closing: a sentence with a blank ---------- */

function Closing() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  return (
    <section className={s.cta} aria-labelledby="cta-title">
      <h2 id="cta-title" className={s.srOnly}>
        Sign in
      </h2>
      <form
        action="/sign-in"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/sign-in${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`);
        }}
      >
        <Rise>
          <p className={s.ctaSentence}>
            Sign in with{" "}
            <label>
              <span className={s.srOnly}>Your university email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={s.ctaInput}
              />
            </label>{" "}
            <button type="submit" className={s.ctaSubmit}>
              Continue
            </button>
          </p>
        </Rise>
      </form>
      <p className={s.ctaNote}>Your institution creates your account. No account yet? Ask your administrator.</p>
    </section>
  );
}

/* ---------- Footer ---------- */

function Footer() {
  return (
    <footer className={s.footer}>
      <div className={s.footerInvite}>
        <p className={s.title}>
          Your next class
          <br />
          is already here.
        </p>
        <Link href="/today" className={`${s.button} ${s.buttonPaper}`}>
          Open CampusVerse
        </Link>
      </div>
      <nav aria-label="More" className={s.footerLinks}>
        <Link href="/sign-in">Sign in</Link>
        <a href="#timetables">Timetable imports</a>
        <a href="#questions">Questions</a>
        <a href="https://github.com/Haseeb0070/campus-verse">Source on GitHub</a>
      </nav>
      <div className={s.footerLegal}>
        <span>© {new Date().getFullYear()} CampusVerse</span>
        <span>
          Classroom photograph:{" "}
          <a href="https://www.flickr.com/photos/60455048@N02/25085082737">
            &ldquo;University of Queensland, Geology Room, St Lucia&rdquo;
          </a>
          , Queensland State Archives, public domain.
        </span>
      </div>
      <p className={s.footerName} aria-hidden="true">
        CampusVerse
      </p>
    </footer>
  );
}
