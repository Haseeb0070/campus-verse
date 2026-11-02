/** A pushpin seen from the front: a round head in `currentColor` with a soft highlight, and the
 *  small shadow it casts on the paper. Colour it with a text class (red for important notices). */
export function Pushpin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 28" aria-hidden="true" className={className}>
      <ellipse cx="14.5" cy="24.5" rx="5" ry="1.6" fill="rgb(0 0 0 / 0.22)" />
      <path d="M12 16v7" stroke="rgb(0 0 0 / 0.3)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="10" r="7.5" fill="currentColor" />
      <circle cx="12" cy="10" r="7" fill="none" stroke="rgb(0 0 0 / 0.18)" />
      <circle cx="9.5" cy="7.5" r="2.4" fill="white" fillOpacity="0.55" />
    </svg>
  );
}

/** A note's tilt in degrees: small, steady per notice (so it doesn't change between visits). */
export function noteTilt(id: number) {
  return (((id * 37) % 7) - 3) * 0.45;
}
