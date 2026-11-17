"use client";

import BlurText from "@/components/reactbits/BlurText";

/** A page's title, set in the serif and settling in word by word as the page opens. */
export function PageTitle({ text, className = "" }: { text: string; className?: string }) {
  return (
    <h1 className={className}>
      <BlurText text={text} trigger="load" effect="drift" blur={4} distance={8} delay={60} stepDuration={0.4} className="gap-x-[0.2em]" />
    </h1>
  );
}
