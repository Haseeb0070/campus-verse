import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { buildPalette, type Palette, type SiteTheme } from "./palette";

export * from "./palette";

const ThemeContext = createContext<Palette>(buildPalette("light"));

/** The institution's colours, in the light or dark mode the person chose on their account. */
export function ThemeProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const me = useMe(signedIn);
  const site = useQuery({
    queryKey: ["theme", signedIn],
    queryFn: () => apiFetch<SiteTheme>("/api/theme"),
    staleTime: 10 * 60_000,
  });
  const mode = signedIn && me.data?.appearance === "dark" ? "dark" : "light";
  const palette = useMemo(() => buildPalette(mode, site.data), [mode, site.data]);
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export const font = {
  display: "Newsreader_600SemiBold",
  displayMedium: "Newsreader_500Medium",
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
