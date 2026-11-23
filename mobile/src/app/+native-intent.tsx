import { appPath } from "@/lib/links";

/**
 * A CampusVerse link opened on the phone (an email's "View on CampusVerse", a shared link) comes
 * in as the website's path. This turns it into the app's screen for the same thing, or Today
 * when the app has no screen for it.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  // Only website links are rewritten; the app's own paths and campusverse:// links pass through.
  if (!/^https?:\/\//i.test(path)) return path;
  try {
    const url = new URL(path);
    return appPath(`${url.pathname}${url.search}${url.hash}`) ?? "/";
  } catch {
    return "/";
  }
}
