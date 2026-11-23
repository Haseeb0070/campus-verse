import { Platform } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

/** Decoration: hidden from screen readers (these props are native-only). */
const hidden =
  Platform.OS === "web"
    ? ({ "aria-hidden": true } as object)
    : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };

/** The CampusVerse logo without its tile: Verse, the guide, in its graduation cap. The face takes
 *  `color`, the eyes are cut out so the tile shows through, and the cap is navy. Keep
 *  in step with docs/brand/verse-buddy.svg. */
export function LogoGlyph({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="12 12 42 42" {...hidden}>
      <Path fill={color} fillRule="evenodd" d="M18 39a14 14 0 1 0 28 0a14 14 0 1 0-28 0ZM24.8 39a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0ZM34.8 39a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0Z" />
      <G fill="#192840">
        <Path d="M32 13 49 20.5 32 28 15 20.5z" />
        <Path d="M49 20.5v9" stroke="#192840" strokeWidth={2} strokeLinecap="round" />
        <Circle cx={49} cy={31} r={2.2} />
      </G>
    </Svg>
  );
}
