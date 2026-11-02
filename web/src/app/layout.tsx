import type { Metadata } from "next";
// Plus Jakarta Sans ships with the app (no build-time fetch from Google Fonts).
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
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
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
