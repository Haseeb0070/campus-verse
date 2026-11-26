import type { ReactNode } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";

/** Stagger: list items arrive one after another, 35 ms apart (the first eight; the rest arrive
 *  with the eighth, so a long list never makes anyone wait). Reduced motion turns it off. */
export function Stagger({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 7) * 35)}>
      {children}
    </Animated.View>
  );
}
