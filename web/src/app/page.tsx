import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "CampusVerse · Govt. Graduate College of Science",
  description:
    "The class app of Govt. Graduate College of Science, Lahore: timetable and room changes, notices, coursework and subject chat, with your college email.",
};

/** The public landing page. The app itself starts at /today, behind sign-in. A signed-out visitor
 *  who opens an app page lands here, with ?next= remembering that page for after signing in. */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  return <Landing next={typeof next === "string" ? next : undefined} />;
}
