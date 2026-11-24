"use client";

import { useEffect } from "react";
import { wakeServer } from "@/lib/wake";

/** Starts the API as soon as anyone opens the site, so it's usually up by the time they need it.
 *  Shows nothing. */
export function ServerWake() {
  useEffect(() => wakeServer(), []);
  return null;
}
