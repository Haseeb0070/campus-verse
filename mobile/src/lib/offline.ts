import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";

/**
 * What the app keeps on the phone so it opens with no signal: your profile, timetable, notices,
 * coursework, calendar, materials and progress, as last fetched. Each screen shows that at once
 * and refreshes when there's a connection. Chat messages, the feed, search and notifications stay
 * network-only. Cleared on sign-out.
 */
const SAVED = new Set(["me", "theme", "timetable", "notices", "assignments", "events", "resources", "progress"]);

/** A week: older than that, the timetable is more misleading than helpful. */
export const SAVED_FOR = 7 * 24 * 60 * 60 * 1000;

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "campusverse.saved",
  throttleTime: 2000,
});

export function shouldSave(query: Query) {
  // Has data, not "succeeded": offline, a refresh fails but the saved data is still good, and
  // must survive the next save.
  return query.state.data !== undefined && SAVED.has(String(query.queryKey[0]));
}

export async function clearSaved() {
  await persister.removeClient();
}
