"use client";

import AnimatedContent from "@/components/reactbits/AnimatedContent";

/**
 * Each page arrives the same way: its sections rise a few pixels and fade in, one after another,
 * so the eye lands on the title first. Keyed by the caller so it runs once per page, not per
 * re-render. Reduced motion shows the page at once (handled inside AnimatedContent).
 */
export function PageEnter({ children }: { children: React.ReactNode }) {
  return (
    <AnimatedContent
      trigger="mount"
      distance={8}
      duration={0.32}
      ease="power3.out"
      stagger={0.03}
      // The page's own top-level blocks (header, cards, lists), capped so long pages don't drag.
      staggerSelector=":scope > * > *:nth-child(-n+5)"
    >
      {children}
    </AnimatedContent>
  );
}
