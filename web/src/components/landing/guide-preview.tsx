"use client";

import { useMemo } from "react";
import { makeGuide } from "./guide";

/** The guide as it will look, for the admin's Theme page. Loaded in the browser only. */
export default function GuidePreview({
  name,
  colours,
  size = 140,
}: {
  name: string;
  colours: { body: string; cap: string; tassel: string };
  size?: number;
}) {
  const Guide = useMemo(
    () => makeGuide(name, colours),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when a colour or the name changes
    [name, colours.body, colours.cap, colours.tassel],
  );
  return <Guide state="happy" size={size} ariaLabel={`${name}, as it will look`} />;
}
