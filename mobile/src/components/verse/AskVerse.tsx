import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Sheet } from "@/components/form";
import { Button, Chip, T } from "@/components/ui";
import { appRoute } from "@/lib/links";
import { useMe } from "@/lib/queries";
import { useTheme } from "@/theme";
import { type Answer, type Question, QUESTIONS_BY_ROLE, roleOf } from "./answers";
import { Verse } from "./Verse";

/**
 * Ask the guide: the website's corner helper, as a sheet. The person picks a question for their
 * role and the guide answers from their own data, with a link to the screen it's about.
 * Admins turn it on or off in Manage → Theme ("Guide in the app").
 */
export function AskVerse({ visible, onClose, onAnswer }: { visible: boolean; onClose: () => void; onAnswer?: (a: Answer) => void }) {
  const p = useTheme();
  const me = useMe().data;
  const role = roleOf(me);
  const name = p.guide.name;
  const firstName = me?.preferred_name || me?.first_name || "there";
  // Each asking gets its own key, so a question asked again is looked up again.
  const [asked, setAsked] = useState<{ q: Question; n: number } | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAsked(null);
      setMood(null);
    }
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title={`Ask ${name}`}>
      <ScrollView contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Verse size={56} state={busy ? "thinking" : asked ? (mood ?? "happy") : "attentive"} lookAt={[0, 0]} />
          <T variant="headline" style={{ flex: 1 }}>
            {asked ? asked.q.ask : `Hi ${firstName}! What do you want to know?`}
          </T>
        </View>
        {asked ? (
          <Reply
            key={asked.n}
            question={asked.q}
            name={name}
            onBusy={setBusy}
            onReady={(a) => {
              setMood(a.mood ?? "happy");
              onAnswer?.(a);
            }}
            onFollow={(href) => {
              const route = appRoute(href);
              onClose();
              if (route) router.push(route);
            }}
          />
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {QUESTIONS_BY_ROLE[role]
            .filter((q) => q.id !== asked?.q.id)
            .map((q) => (
              <Chip
                key={q.id}
                label={q.ask}
                on={false}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                  setMood(null);
                  setAsked((a) => ({ q, n: (a?.n ?? 0) + 1 }));
                }}
              />
            ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

/** One question: the guide thinks for a moment, then the answer and its link. */
function Reply({
  question,
  name,
  onBusy,
  onReady,
  onFollow,
}: {
  question: Question;
  name: string;
  onBusy: (busy: boolean) => void;
  onReady: (a: Answer) => void;
  onFollow: (href: string) => void;
}) {
  const p = useTheme();
  const reply = question.useReply({ name });
  // Picked once per asking (tips are random), not on every render.
  const [fixed, setFixed] = useState(reply);
  const [thinking, setThinking] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setThinking(false), 700);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!fixed && reply) setFixed(reply);
  }, [fixed, reply]);
  const ready = !thinking && fixed;
  useEffect(() => {
    onBusy(!ready);
    if (ready) onReady(fixed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(ready)]);

  if (!ready) {
    return (
      <View
        accessibilityLabel={`${name} is looking it up`}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: p.fill, borderRadius: 14, padding: 14 }}
      >
        <ActivityIndicator color={p.accent} />
        <T variant="callout" tone="ink3">
          Looking it up…
        </T>
      </View>
    );
  }
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ backgroundColor: p.fill, borderRadius: 14, padding: 14, gap: 12 }}>
      <T variant="body" accessibilityLiveRegion="polite">
        {fixed.text}
      </T>
      {fixed.link ? (
        <Button label={fixed.link.label} variant="secondary" style={{ alignSelf: "flex-start", minHeight: 40 }} onPress={() => onFollow(fixed.link!.href)} />
      ) : null}
    </Animated.View>
  );
}
