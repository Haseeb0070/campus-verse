'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
// CampusVerse: the three Hugeicons paths are inlined. Importing @hugeicons/core-free-icons pulled
// thousands of icon modules into every dev compile of the feed.
const FavouriteIcon = [["path",{"d":"M2 8.69444C2 13.0348 7.58942 17.858 10.4107 19.9677C11.3601 20.6776 12.6399 20.6776 13.5893 19.9677C16.4106 17.858 22 13.0348 22 8.69444C22 5.82563 19.8947 3.5 17 3.5C15.5 3.5 14 4 12 6C10 4 8.5 3.5 7 3.5C4.10526 3.5 2 5.82563 2 8.69444Z","key":"0"}]] as const;
const StarIcon = [["path",{"d":"M12.7972 2.90494C13.2554 3.57043 13.9479 4.70769 14.6514 6.04507C15.1942 7.07701 15.4657 7.59298 15.8551 7.86959C16.2444 8.14621 16.812 8.2313 17.9472 8.40149C19.5204 8.63736 20.6806 8.89214 21.3467 9.05516C21.735 9.15017 21.9976 9.50036 21.9976 9.9001C21.9976 10.1262 21.9127 10.344 21.7606 10.5113C21.0637 11.2777 20.3487 12.0836 19.4701 12.961C18.605 13.8249 18.1724 14.2569 18.0253 14.7261C17.8781 15.1954 17.9834 15.7792 18.1939 16.9469C18.3735 17.9433 18.5569 19.1306 18.6921 20.4219C18.7528 21.0024 18.2921 21.5 17.7085 21.5C17.6522 21.5 17.5967 21.4962 17.542 21.4824C17.0502 21.3578 15.919 20.7845 14.1246 19.7243C13.0722 19.1025 12.5461 18.7917 11.9993 18.7917C11.4526 18.7917 10.9265 19.1026 9.87427 19.7244C8.08025 20.7845 6.94977 21.3578 6.45797 21.4824C6.40334 21.4962 6.34784 21.5 6.29148 21.5C5.70788 21.5 5.24716 21.0024 5.30793 20.4219C5.44314 19.1306 5.6265 17.9433 5.80612 16.9469C6.01661 15.7792 6.12186 15.1954 5.97471 14.7261C5.82756 14.2569 5.395 13.8249 4.52987 12.961C3.65132 12.0836 2.93633 11.2777 2.23944 10.5113C2.08729 10.344 2.00244 10.1262 2.00244 9.9001C2.00244 9.50036 2.265 9.15017 2.65328 9.05516C3.31945 8.89214 4.4796 8.63736 6.05284 8.40149C7.18801 8.2313 7.75559 8.14621 8.14498 7.86958C8.53437 7.59295 8.80577 7.07698 9.34859 6.04505C10.0521 4.70768 10.7445 3.57044 11.2026 2.90495C11.3825 2.64364 11.6827 2.5 11.9999 2.5C12.3171 2.5 12.6173 2.64364 12.7972 2.90494Z","key":"0"}]] as const;
const ThumbsUpIcon = [["path",{"d":"M2 12.5V18.5C2 18.9647 2 19.197 2.03843 19.3902C2.19624 20.1836 2.81644 20.8038 3.60982 20.9616C3.80302 21 4.03534 21 4.5 21C4.96466 21 5.19698 21 5.39018 20.9616C6.18356 20.8038 6.80376 20.1836 6.96157 19.3902C7 19.197 7 18.9647 7 18.5V12.5C7 12.0353 7 11.803 6.96157 11.6098C6.80376 10.8164 6.18356 10.1962 5.39018 10.0384C5.19698 10 4.96466 10 4.5 10C4.03534 10 3.80302 10 3.60982 10.0384C2.81644 10.1962 2.19624 10.8164 2.03843 11.6098C2 11.803 2 12.0353 2 12.5Z","key":"0"}],["path",{"d":"M14 10H19.5107C20.8855 10 22 11.1145 22 12.4893C22 13.4915 21.8603 14.4889 21.585 15.4526L20.9325 17.7362C20.3805 19.6681 18.6148 21 16.6056 21H13.5C10.7 21 7.83333 19.8333 7 19V12C7 11 8.23223 9.26777 10 7.5C11.3849 6.1151 11.7309 4.89002 11.8681 3.99079C11.9558 3.41598 12.4185 3 13 3C14 3 15.5 4 15.5 6C15.5 8 14.5 9 14 10Z","key":"1"}]] as const;

export type PulseHeartIcon = 'heart' | 'star' | 'thumb';

export interface PulseHeartProps {
  liked?: boolean;
  defaultLiked?: boolean;
  count?: number;
  onChange?: (liked: boolean, count: number) => void;
  showCount?: boolean;
  icon?: PulseHeartIcon | ReactNode;
  idleOutline?: boolean;
  size?: number;
  corner?: number;
  likedColor?: string;
  idleColor?: string;
  pillColor?: string;
  textColor?: string;
  duration?: number;
  dotSize?: number;
  overshoot?: number;
  beat?: number;
  rollDuration?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
}

type IconData = readonly (readonly [string, { readonly [key: string]: string | number }])[];
type Roll = { a: string; b: string; at: number; up: boolean };
type Cell = { ch: string } | { top: string; bottom: string };

const OUT = 0.4;
const ICONS: Record<PulseHeartIcon, IconData> = { heart: FavouriteIcon, star: StarIcon, thumb: ThumbsUpIcon };

const back = (k: number, c: number) => {
  const u = k - 1;
  return 1 + (c + 1) * u ** 3 + c * u ** 2;
};
const swellOf = (t: number, c: number) =>
  t <= 0 ? 0 : t < OUT ? 1 - (1 - t / OUT) ** 3 : 1 - back((t - OUT) / (1 - OUT), c);
const format = (n: number) => new Intl.NumberFormat().format(n);
const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const PulseHeart: React.FC<PulseHeartProps> = ({
  liked: likedProp,
  defaultLiked = false,
  count = 0,
  onChange,
  showCount = true,
  icon = 'heart',
  idleOutline = true,
  size = 40,
  corner = 32,
  likedColor = '#ff4d6d',
  idleColor = '#8b8b93',
  pillColor = '#232326',
  textColor = '#f5f5f5',
  duration = 560,
  dotSize = 0.3,
  overshoot = 1.7,
  beat = 3,
  rollDuration = 350,
  disabled = false,
  label = 'Like',
  className = ''
}) => {
  const controlled = likedProp !== undefined;
  const [inner, setInner] = useState(defaultLiked);
  const [total, setTotal] = useState(count);
  const liked = controlled ? likedProp : inner;
  const [shown, setShown] = useState({ liked, count });
  const [roll, setRoll] = useState<Roll | null>(null);

  const rootRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const heartRef = useRef<HTMLSpanElement>(null);
  const glyphRef = useRef<SVGGElement>(null);
  const rollRef = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viaPointer = useRef(false);
  const shownRef = useRef(shown);
  const logical = useRef({ liked, count: total });
  logical.current = { liked, count: total };
  const cfg = useRef({ duration, dotSize, overshoot, beat, rollDuration });
  cfg.current = { duration, dotSize, overshoot, beat, rollDuration };

  useEffect(() => {
    setTotal(count);
  }, [count]);

  useEffect(() => {
    if (raf.current) return;
    if (shownRef.current.liked === liked && shownRef.current.count === total) return;
    shownRef.current = { liked, count: total };
    setShown(shownRef.current);
  }, [liked, total]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || root.dataset.instant === undefined) return;
    root.getBoundingClientRect();
    delete root.dataset.instant;
  }, [shown]);

  useLayoutEffect(() => {
    const el = rollRef.current;
    if (!el || !roll) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${roll.up ? '0' : '-1em'})`;
    el.getBoundingClientRect();
    el.style.transition = '';
    el.style.transform = `translateY(${roll.up ? '-1em' : '0'})`;
  }, [roll]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(rollTimer.current);
    },
    []
  );

  const startRoll = (from: number, to: number) => {
    if (from === to) return;
    const a = format(from);
    const b = format(to);
    const changed = a.length === b.length ? [...b].flatMap((ch, i) => (ch !== a[i] ? [i] : [])) : [];
    setRoll({ a, b, at: changed.length === 1 ? changed[0] : -1, up: to > from });
    clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => setRoll(null), cfg.current.rollDuration);
  };

  const run = (nextLiked: boolean, nextCount: number) => {
    const root = rootRef.current;
    const heart = heartRef.current;
    const pill = pillRef.current;
    if (!root || !heart || !pill) return;
    const glyph = glyphRef.current;
    root.dataset.running = '';
    let swapped = false;
    let prev = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const { duration: D, dotSize: dot, overshoot: c, beat: B } = cfg.current;
      const t = Math.min(1, (now - t0) / D);
      const step = prev ? now - prev : 1000 / 60;
      prev = now;
      const s = swellOf(t, c);
      const k = 1 - (1 - dot) * s;
      if (glyph) glyph.setAttribute('transform', `translate(12 12) scale(${k}) translate(-12 -12)`);
      else heart.style.transform = `scale(${k})`;
      pill.style.transform = `scale(${1 - (B / 100) * s})`;
      if (!swapped && t + step / 2 / D >= OUT) {
        swapped = true;
        root.dataset.liked = String(nextLiked);
        startRoll(shownRef.current.count, nextCount);
        shownRef.current = { liked: nextLiked, count: nextCount };
        setShown(shownRef.current);
      }
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      raf.current = 0;
      if (glyph) glyph.removeAttribute('transform');
      heart.style.transform = '';
      pill.style.transform = '';
      delete root.dataset.running;
      const l = logical.current;
      if (l.liked !== shownRef.current.liked || l.count !== shownRef.current.count) {
        shownRef.current = { liked: l.liked, count: l.count };
        setShown(shownRef.current);
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled) return;
    viaPointer.current = true;
    if (!reducedMotion() && rootRef.current) rootRef.current.dataset.pressed = '';
  };
  const handlePointerUp = () => {
    if (rootRef.current) delete rootRef.current.dataset.pressed;
  };
  const handlePointerCancel = () => {
    viaPointer.current = false;
    handlePointerUp();
  };
  const handleKeyDown = () => {
    viaPointer.current = false;
  };
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || raf.current) return;
    const pointer = viaPointer.current && e.detail !== 0;
    viaPointer.current = false;
    const nextLiked = !liked;
    const nextCount = total + (nextLiked ? 1 : -1);
    if (!controlled) setInner(nextLiked);
    setTotal(nextCount);
    onChange?.(nextLiked, nextCount);
    if (pointer && !reducedMotion()) run(nextLiked, nextCount);
    else if (rootRef.current) rootRef.current.dataset.instant = '';
  };

  const paths = typeof icon === 'string' ? ICONS[icon as PulseHeartIcon] || ICONS.heart : null;
  const text = format(shown.count);
  const cells: Cell[] = roll
    ? roll.at === -1
      ? [{ top: roll.up ? roll.a : roll.b, bottom: roll.up ? roll.b : roll.a }]
      : [...roll.b].map((ch, i) =>
          i === roll.at ? { top: roll.up ? roll.a[i] : ch, bottom: roll.up ? ch : roll.a[i] } : { ch }
        )
    : [...text].map(ch => ({ ch }));

  return (
    <button
      ref={rootRef}
      type="button"
      aria-pressed={liked}
      disabled={disabled}
      data-liked={String(shown.liked)}
      data-solid={idleOutline ? undefined : ''}
      data-no-count={showCount ? undefined : ''}
      className={`group relative m-0 inline-flex cursor-pointer touch-manipulation select-none items-center justify-center border-0 bg-transparent p-0 outline-none [font-family:inherit] [color:var(--ph-text)] rounded-[var(--ph-corner)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [transition:transform_160ms_var(--ph-ease-out)] data-[pressed]:[transform:scale(0.97)] focus-visible:outline-offset-[3px] focus-visible:[outline:2px_solid_color-mix(in_srgb,var(--ph-liked)_60%,transparent)] disabled:cursor-default disabled:opacity-[0.55] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 ${className}`}
      style={
        {
          '--ph-size': `${size}px`,
          '--ph-corner': `${corner}px`,
          '--ph-pill': pillColor,
          '--ph-idle': idleColor,
          '--ph-liked': likedColor,
          '--ph-text': textColor,
          '--ph-roll': `${rollDuration}ms`,
          '--ph-stroke': `${(1.5 * size) / 24}px`,
          '--ph-ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)'
        } as CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
    >
      <span
        ref={pillRef}
        className="inline-flex origin-center items-center [gap:calc(var(--ph-size)*0.25)] [padding:calc(var(--ph-size)*0.3)] [padding-inline-end:calc(var(--ph-size)*0.4)] group-data-[no-count]:[padding-inline-end:calc(var(--ph-size)*0.3)] rounded-[var(--ph-corner)] [background:var(--ph-pill)] [@media(prefers-contrast:more)]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--ph-text)_25%,transparent)]"
      >
        <span
          ref={heartRef}
          className="block h-[var(--ph-size)] w-[var(--ph-size)] origin-center [color:var(--ph-idle)] [transition:color_160ms_ease] group-data-[liked=true]:[color:var(--ph-liked)] group-data-[running]:transition-none group-data-[instant]:transition-none motion-reduce:[transition:color_200ms_ease] [&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg]:overflow-visible [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:var(--ph-stroke)] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] group-data-[liked=true]:[&_svg]:fill-current group-data-[solid]:[&_svg]:fill-current [@media(hover:hover)_and_(pointer:fine)]:group-enabled:group-hover:group-data-[liked=false]:[color:color-mix(in_srgb,var(--ph-idle)_45%,var(--ph-liked))]"
          aria-hidden="true"
        >
          {paths ? (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <g ref={glyphRef}>
                {paths.map(([, attrs]) => (
                  <path key={String(attrs.key)} d={String(attrs.d)} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            </svg>
          ) : (
            icon
          )}
        </span>
        {showCount ? (
          <span
            className="inline-flex font-semibold leading-none tracking-[-0.1px] tabular-nums [font-size:calc(var(--ph-size)*0.5)] [color:var(--ph-text)] [&>span]:block [&>span]:h-[1em]"
            aria-hidden="true"
          >
            {cells.map((cell, i) =>
              'ch' in cell ? (
                <span key={`c${i}`}>{cell.ch}</span>
              ) : (
                <span key={`r${i}`} className="relative overflow-hidden">
                  <span
                    ref={rollRef}
                    className="flex flex-col [transition:transform_var(--ph-roll)_var(--ph-ease-out)] motion-reduce:transition-none [&>span]:block [&>span]:h-[1em] [&>span]:leading-none"
                  >
                    <span>{cell.top}</span>
                    <span>{cell.bottom}</span>
                  </span>
                </span>
              )
            )}
          </span>
        ) : null}
        <span className="sr-only">{showCount ? `${label}, ${format(total)}` : label}</span>
      </span>
    </button>
  );
};

export default PulseHeart;
