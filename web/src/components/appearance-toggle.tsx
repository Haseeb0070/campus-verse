"use client";

import { MoonIcon, TodayIcon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";

/** Switches between light and dark for this person. Shows what pressing it gives. */
export function AppearanceToggle({ className = "", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { appearance, setAppearance } = useTheme();
  const next = appearance === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Dark mode" : "Light mode";
  const Icon = next === "dark" ? MoonIcon : TodayIcon;
  return (
    <button
      type="button"
      onClick={() => setAppearance(next)}
      aria-label={withLabel ? undefined : `Switch to ${label.toLowerCase()}`}
      title={`Switch to ${label.toLowerCase()}`}
      className={className}
    >
      <Icon className="size-5" />
      {withLabel && <span className="flex-1 text-left">{label}</span>}
    </button>
  );
}
