import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "CampusVerse · Your campus, up next",
  description:
    "The academic home for your university: timetables and room changes, notices, coursework, attendance and live section chat, for students, teachers and staff.",
};

/** The public landing page. The app itself starts at /today, behind sign-in. */
export default function Home() {
  return <Landing />;
}
