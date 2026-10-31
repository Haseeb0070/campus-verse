import type { Metadata } from "next";
import "./globals.css";

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
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
