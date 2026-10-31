"use client";

import { useState } from "react";

/** Clean axis maximum: 1, 2, 5, 10, 20, 50… at or above the data's maximum. */
function niceMax(value: number) {
  if (value <= 4) return Math.max(1, Math.ceil(value));
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n);

/** One series over time, as columns: thin, rounded at the data end, square at the baseline, one
    accent hue, a recessive hairline grid, the latest value labelled, every value on hover and
    focus, and a table view so nothing hides behind the tooltip. */
export function ColumnChart({
  title,
  points,
  formatLabel,
}: {
  title: string;
  points: { label: string; value: number }[];
  formatLabel: (label: string) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const ticks = [max, max / 2, 0];
  const last = points.length - 1;
  const total = points.reduce((n, p) => n + p.value, 0);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-body font-semibold">{title}</span>
        <span className="text-footnote text-ink-2">{compact(total)} in total</span>
      </figcaption>
      {table ? (
        <table className="w-full text-left text-footnote">
          <thead className="text-caption text-ink-2">
            <tr><th scope="col" className="py-1 font-semibold">Period</th><th scope="col" className="py-1 text-right font-semibold">Count</th></tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-t border-divider">
                <td className="py-1.5">{formatLabel(p.label)}</td>
                <td className="py-1.5 text-right tabular-nums">{p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative mt-4 flex h-40 gap-2">
          <div className="flex w-8 flex-col justify-between text-right text-caption tabular-nums text-ink-3" aria-hidden="true">
            {ticks.map((t) => <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{compact(t)}</span>)}
          </div>
          <div className="relative flex-1">
            {/* Hairline grid, recessive: one step off the surface. */}
            {ticks.map((t) => (
              <span key={t} aria-hidden="true" className="absolute inset-x-0 h-px bg-[var(--cv-divider)]"
                style={{ bottom: `${(t / max) * 100}%` }} />
            ))}
            <ul className="absolute inset-0 flex items-end gap-0.5" onPointerLeave={() => setActive(null)}>
              {points.map((p, i) => {
                const height = max ? (p.value / max) * 100 : 0;
                return (
                  <li key={p.label} className="relative flex h-full flex-1 items-end justify-center">
                    <button
                      type="button"
                      aria-label={`${formatLabel(p.label)}: ${p.value}`}
                      onPointerEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                      className="absolute inset-0 rounded-[6px] outline-offset-0 hover:bg-fill focus-visible:bg-fill"
                    />
                    <span aria-hidden="true"
                      className={`pointer-events-none relative w-full max-w-6 rounded-t-[4px] bg-accent transition-opacity ${
                        active !== null && active !== i ? "opacity-60" : ""}`}
                      style={{ height: `${height}%`, minHeight: p.value ? 2 : 0 }} />
                    {i === last && p.value > 0 && active === null && (
                      <span aria-hidden="true" className="pointer-events-none absolute text-caption font-semibold tabular-nums"
                        style={{ bottom: `calc(${height}% + 4px)` }}>
                        {compact(p.value)}
                      </span>
                    )}
                    {active === i && (
                      <span role="status"
                        className={`glass-thick pointer-events-none absolute z-10 whitespace-nowrap rounded-[10px] px-2.5 py-1.5 text-left ${
                          i > points.length / 2 ? "right-0" : "left-0"}`}
                        style={{ bottom: `calc(${Math.min(height, 55)}% + 8px)` }}>
                        <span className="block text-body font-bold tabular-nums">{p.value}</span>
                        <span className="block text-caption text-ink-2">{formatLabel(p.label)}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      <div className="flex justify-between pl-10 text-caption text-ink-3" aria-hidden={table}>
        {!table && <span>{formatLabel(points[0]?.label ?? "")}</span>}
        {!table && <span>{formatLabel(points[last]?.label ?? "")}</span>}
      </div>
      <button type="button" onClick={() => setTable((t) => !t)}
        className="self-start text-footnote font-semibold text-accent-ink">
        {table ? "Show as a chart" : "Show as a table"}
      </button>
    </figure>
  );
}

/** A share of a whole: the fill on a lighter track of the same hue, the value written beside it. */
export function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-accent/15" role="meter"
        aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
        {value !== null && (
          <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
        )}
      </span>
      <span className="w-11 text-right text-footnote font-semibold tabular-nums">{value === null ? "–" : `${value}%`}</span>
    </span>
  );
}

/** A labelled headline number. */
export function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="glass rounded-card p-5">
      <p className="text-footnote font-semibold text-ink-2">{label}</p>
      <p className="mt-1 text-title-1 font-bold">{value}</p>
      {detail && <p className="text-footnote text-ink-2">{detail}</p>}
    </div>
  );
}
