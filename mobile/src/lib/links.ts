import type { Href } from "expo-router";

/**
 * Notifications and search results carry the web app's links ("/assignments/12",
 * "/notices#notice-4"). This is where each one lives in the app, or null when it is a part of
 * CampusVerse only the website has.
 */
export function appRoute(link: string): Href | null {
  const [path, query = ""] = link.split("#")[0].split("?");
  const parts = path.split("/").filter(Boolean);
  const id = Number(parts[1]);

  switch (parts[0]) {
    case "assignments":
      return Number.isFinite(id) && id > 0 ? { pathname: "/assignment/[id]", params: { id: String(id) } } : "/work";
    case "chat": {
      // "/chat?to=12": a person from search, to message one-to-one.
      const to = /(?:^|&)to=(\d+)/.exec(query)?.[1];
      if (to && !parts[1]) return { pathname: "/new-chat", params: { to } };
      return Number.isFinite(id) && id > 0 ? { pathname: "/chat/[id]", params: { id: String(id) } } : "/chat";
    }
    case "resources":
      return Number.isFinite(id) && id > 0
        ? { pathname: "/resources/[id]", params: { id: String(id) } }
        : "/resources";
    case "notices":
      return "/notices";
    case "timetable":
    case "today":
      return parts[0] === "today" ? "/" : "/timetable";
    case "progress":
      return "/progress";
    case "notifications":
      return "/notifications";
    case "profile":
      return "/profile";
    default:
      return null;
  }
}
