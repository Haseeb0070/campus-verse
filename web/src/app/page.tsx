import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "CampusVerse · Govt. Graduate College of Science",
  description:
    "The class app of Govt. Graduate College of Science, Lahore: timetable and room changes, notices, coursework and section chat, with your college email.",
};

/** The public landing page. The app itself starts at /today, behind sign-in. */
export default function Home() {
  return <Landing />;
}
