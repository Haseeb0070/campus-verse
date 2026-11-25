"use client";

import SquishSwitch from "@/components/reactbits/SquishSwitch";

/**
 * An on/off switch drawn in the theme (role="switch"), for settings that apply right away.
 * React Bits' SquishSwitch: the thumb can be flicked or dragged, stretches with its speed and
 * squashes against the end. Reduced motion turns the stretch off.
 */
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
    <SquishSwitch
      checked={checked}
      onChange={onChange}
      ariaLabel={label}
      disabled={disabled}
      width={46}
      height={26}
      radius={13}
      stretch={40}
      trackColor="var(--cv-fill-strong)"
      trackOnColor="var(--cv-accent)"
      thumbColor="#fffaf2"
      thumbOnColor="#fffaf2"
      colorDuration={140}
      className="shrink-0 [&_[role=switch]>span>span]:shadow-[0_1px_3px_rgb(40_25_10/0.3)]"
    />
  );
}
