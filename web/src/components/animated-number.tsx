"use client";

import CountUp from "@/components/reactbits/CountUp";

/**
 * A headline number that rolls up when it first shows. Values that start with a whole number
 * ("42", "87%", "12 posts") roll the number and keep the rest; anything else ("–") is shown as is.
 */
export function AnimatedNumber({ value }: { value: string | number }) {
  const m = /^(\d{1,9})(\D.*)?$/.exec(String(value));
  if (!m) return <>{value}</>;
  return (
    <span className="tabular-nums">
      <CountUp to={Number(m[1])} duration={1.1} trigger="view" mode="roll" />
      {m[2]}
    </span>
  );
}
