"use client";

import JellyRadio from "@/components/reactbits/JellyRadio";

export interface ChipOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/**
 * A row of filter chips (one choice at a time) on a glass pill. React Bits' JellyRadio: the
 * chosen chip swells a little and nudges its neighbours aside on a spring. Arrow keys move the
 * choice, as in any radio group. Reduced motion jumps straight to the new state.
 */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers ("Show", "Period"). */
  label: string;
  /** Classes for the pill around the chips (width, wrapping, self-alignment). */
  className?: string;
}) {
  return (
    <div className={`glass max-w-full overflow-x-auto rounded-full ${className}`}>
      <JellyRadio
        items={options}
        value={value}
        onChange={(v) => onChange(v as T)}
        ariaLabel={label}
        chipColor="transparent"
        activeColor="var(--cv-accent)"
        textColor="var(--cv-ink-2)"
        activeTextColor="var(--cv-on-accent)"
        size="md"
        gap={2}
        radius={999}
        swell={0.06}
        barge={3}
        shrink={0.02}
        jelly={0.8}
        bounce={0.3}
        className="whitespace-nowrap font-semibold"
      />
    </div>
  );
}
