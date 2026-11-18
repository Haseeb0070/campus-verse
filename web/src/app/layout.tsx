import type { Metadata } from "next";
// Plus Jakarta Sans ships with the app (no build-time fetch from Google Fonts).
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/newsreader";
import "./globals.css";
import { BOOT_SCRIPT } from "@/lib/theme";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "CampusVerse",
  description: "Your academic home: classes, notices, chat and coursework in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The before-paint script sets data-theme (light or dark) on <html>, so React leaves it be.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
