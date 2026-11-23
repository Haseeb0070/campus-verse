import type { Href } from "expo-router";

/**
 * Notifications and search results carry the web app's links ("/assignments/12",
 * "/notices#notice-4"). This is where each one lives in the app, or null when it is a part of
 * CampusVerse only the website has.
 */
export function appRoute(link: string): Href | null {
  const [beforeHash, hash = ""] = link.split("#");
  const [path, query = ""] = beforeHash.split("?");
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
    case "feed": {
      // "/feed#post-12": one post.
      const post = /^post-(\d+)$/.exec(hash)?.[1];
      return post ? { pathname: "/feed/[id]", params: { id: post } } : "/feed";
    }
    case "calendar":
      return Number.isFinite(id) && id > 0 ? { pathname: "/calendar/[id]", params: { id: String(id) } } : "/calendar";
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

/** appRoute as a path string ("/assignment/12"), for rewriting links that open the app. */
export function appPath(link: string): string | null {
  const route = appRoute(link);
  if (route === null || typeof route === "string") return route;
  const { pathname, params = {} } = route as { pathname: string; params?: Record<string, string> };
  const rest = { ...params };
  let path = pathname.replace(/\[(\w+)\]/g, (_, key: string) => {
    const value = rest[key] ?? "";
    delete rest[key];
    return encodeURIComponent(value);
  });
  const query = Object.entries(rest).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  if (query) path += `?${query}`;
  return path;
}
