import { ApiStatus } from "@/components/api-status";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

const courses = [
  { code: "CS-301", title: "Data Structures", color: "bg-course-lagoon" },
  { code: "MATH-210", title: "Linear Algebra", color: "bg-course-tangerine" },
  { code: "ENG-105", title: "Technical Writing", color: "bg-course-orchid" },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">Development build</p>
          <h1 className="text-large-title font-bold">CampusVerse</h1>
        </div>
        <ApiStatus />
      </header>

      <section className="glass rounded-card p-7">
        <p className="text-footnote font-semibold text-ink-2">Design tokens are live</p>
        <h2 className="mt-1 text-title-1 font-bold">Glass theme, system font, course colours</h2>
        <p className="mt-2 max-w-prose text-body text-ink-2">
          This page only checks the setup. Real screens come next, built from the tokens in
          globals.css and the motion rules in SKILL.md.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={`${backendUrl}/api/docs`}
            className="press inline-flex h-11 items-center rounded-full bg-accent px-5 text-body font-semibold text-on-accent"
          >
            Open API docs
          </a>
          <a
            href={`${backendUrl}/admin/`}
            className="press inline-flex h-11 items-center rounded-full bg-fill-strong px-5 text-body font-semibold"
          >
            Django admin
          </a>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Sample courses">
        {courses.map((course) => (
          <div key={course.code} className="glass flex items-center gap-3 rounded-row p-4">
            <span className={`size-3 rounded ${course.color}`} aria-hidden="true" />
            <span>
              <span className="block text-headline font-semibold">{course.title}</span>
              <span className="block text-footnote text-ink-2">{course.code}</span>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
