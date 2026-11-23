import { Platform } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/** Icons are decoration: their buttons carry the label. */
const hidden =
  Platform.OS === "web"
    ? ({ "aria-hidden": true } as object)
    : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };

/** The stroke icons from the CampusVerse design, drawn at 24×24. */
const shapes = {
  home: (
    <>
      <Path d="M3 10.5 12 3l9 7.5" />
      <Path d="M5 9.5V20h14V9.5" />
      <Path d="M10 20v-5h4v5" />
    </>
  ),
  calendar: (
    <>
      <Rect x={3.5} y={5} width={17} height={15} rx={2.5} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  chat: <Path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" />,
  pin: (
    <>
      <Path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
      <Path d="M12 14v7" />
    </>
  ),
  clipboard: (
    <>
      <Rect x={5} y={4} width={14} height={17} rx={2} />
      <Path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m20 20-4.2-4.2" />
    </>
  ),
  bell: (
    <>
      <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" />
      <Path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),
  location: (
    <>
      <Path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z" />
      <Circle cx={12} cy={9.5} r={2.5} />
    </>
  ),
  swap: <Path d="M4 8h13l-3-3M20 16H7l3 3" />,
  back: <Path d="m15 5-7 7 7 7" />,
  chevron: <Path d="m9 5 7 7-7 7" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  attach: <Path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7" />,
  send: <Path d="M4 12 20 4l-5 16-3-7-8-1Z" />,
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  file: (
    <>
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <Path d="M14 3v5h5" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  user: (
    <>
      <Circle cx={12} cy={8.5} r={3.8} />
      <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  moon: <Path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />,
  sun: (
    <>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  logout: (
    <>
      <Path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <Path d="M10 16 6 12l4-4M6 12h10" />
    </>
  ),
  chart: <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  online: <Path d="M3 12h4l3 7 4-14 3 7h4" />,
  trash: (
    <>
      <Path d="M4 7h16M10 11v6M14 11v6" />
      <Path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  mute: (
    <>
      <Path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8" />
      <Path d="M3 3l18 18" />
    </>
  ),
  arch: (
    <>
      <Path d="M6 20V10a6 6 0 0 1 12 0v10" />
      <Path d="M10 20v-7a2 2 0 0 1 4 0v7" />
    </>
  ),
  refresh: (
    <>
      <Path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
      <Path d="M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16" />
      <Path d="M20 20v-4h-4" />
    </>
  ),
  pencil: <Path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  heart: <Path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />,
  flag: <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
} as const;

export type IconName = keyof typeof shapes;

export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 1.8,
  fill = "none",
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Solid shapes (a liked heart); outlines by default. */
  fill?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...hidden}
    >
      {shapes[name]}
    </Svg>
  );
}
