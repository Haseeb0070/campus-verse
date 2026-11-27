"use client";

import { forwardRef, useState } from "react";

/**
 * A password field with an eye button to show or hide what was typed. Takes the same props as an
 * <input>; the className styles the field, and room is kept on the right for the button.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  function PasswordInput({ className = "", ...props }, ref) {
    const [shown, setShown] = useState(false);
    return (
      <span className="relative block w-full">
        <input ref={ref} {...props} type={shown ? "text" : "password"} className={`${className} pr-12`}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          title={shown ? "Hide password" : "Show password"}
          className="press absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:bg-fill-strong hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
            {shown && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </span>
    );
  },
);
