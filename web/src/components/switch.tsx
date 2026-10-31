"use client";

/** An on/off switch drawn in the theme (role="switch"), for settings that apply right away. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[26px] w-[44px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-150 motion-reduce:transition-none disabled:cursor-default disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-fill-strong ring-1 ring-inset ring-[var(--cv-divider)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-[22px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-150 motion-reduce:transition-none ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
