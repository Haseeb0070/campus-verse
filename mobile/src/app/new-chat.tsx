import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, TextInput, View } from "react-native";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Divider, Empty, Failed, Press, Skeleton, T } from "@/components/ui";
import { apiFetch, errorDetail } from "@/lib/api";
import { usePeople } from "@/lib/chat";
import type { ChatPerson, Conversation } from "@/lib/types";
import { font, radius, useTheme } from "@/theme";

export default function NewChat() {
  const p = useTheme();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const people = usePeople(debounced);
  const [opening, setOpening] = useState<number | null>(null);
  // Opened from search with someone already chosen: go straight to that chat.
  const { to } = useLocalSearchParams<{ to?: string }>();
  const started = useRef(false);
  useEffect(() => {
    if (!to || started.current) return;
    started.current = true;
    start({ id: Number(to), name: "", initials: "", kind: "student", detail: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  async function start(person: ChatPerson) {
    setOpening(person.id);
    try {
      const conv = await apiFetch<Conversation>("/api/chat/direct", {
        method: "POST",
        body: JSON.stringify({ user_id: person.id }),
      });
      qc.invalidateQueries({ queryKey: ["chat"] });
      router.replace({ pathname: "/chat/[id]", params: { id: String(conv.id) } });
    } catch (err) {
      Alert.alert("Couldn't start the chat", errorDetail(err, "Try again."));
    } finally {
      setOpening(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="New message" subtitle="Classmates and teachers you share a section with" />
      <View style={{ padding: 16 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder="Search by name"
          placeholderTextColor={p.ink3}
          accessibilityLabel="Search people by name"
          autoCorrect={false}
          style={{
            minHeight: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: p.line,
            backgroundColor: p.surface,
            paddingHorizontal: 16,
            fontFamily: font.regular,
            fontSize: 16,
            color: p.ink,
          }}
        />
      </View>
      {people.isPending ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Skeleton height={220} />
        </View>
      ) : people.isError ? (
        <Failed onRetry={() => people.refetch()} />
      ) : (
        <FlatList
          data={people.data}
          keyExtractor={(x) => String(x.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          ItemSeparatorComponent={() => <Divider inset={62} />}
          ListEmptyComponent={<Empty icon="user" title="Nobody found" body="Try another name." />}
          renderItem={({ item }) => (
            <Press
              accessibilityRole="button"
              accessibilityLabel={`Message ${item.name}${item.detail ? `, ${item.detail}` : ""}`}
              disabled={opening !== null}
              onPress={() => start(item)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: opening && opening !== item.id ? 0.5 : 1 }}
            >
              <Avatar text={item.initials} color={item.kind === "teacher" ? "lime" : "sky"} size={46} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{item.name}</T>
                <T variant="callout" tone="ink3" numberOfLines={1}>
                  {item.kind === "teacher" ? "Teacher" : item.kind === "staff" ? "Staff" : "Student"}
                  {item.detail ? ` · ${item.detail}` : ""}
                </T>
              </View>
            </Press>
          )}
        />
      )}
    </View>
  );
}
