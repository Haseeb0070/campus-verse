import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Button, Card, Divider, Field, Press, Segmented, Skeleton, T, Toggle } from "@/components/ui";
import { apiFetch, errorDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { initials } from "@/lib/format";
import { type NotificationPreference, useNotificationPreferences } from "@/lib/notifications";
import { useMe } from "@/lib/queries";
import { useRepsMine } from "@/lib/reps";
import type { Me } from "@/lib/types";
import { useTheme } from "@/theme";

export default function Profile() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const auth = useAuth();
  const m = me.data;
  const reps = useRepsMine(!!m && m.kind !== "staff").data;
  // Teachers approve CR/GR changes there; a CR or GR follows what they asked for.
  const showRequests = !!m && (m.sections.some((s) => s.teaching) || Object.keys(reps?.sections ?? {}).length > 0);

  function confirmSignOut() {
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Sign out of CampusVerse on this device?")) auth.signOut();
      return;
    }
    Alert.alert("Sign out?", "You'll need your email and password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => auth.signOut() },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="You" />
      {!m ? (
        <View style={{ padding: 16 }}>
          <Skeleton height={140} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
            <Avatar text={initials(m.full_name)} color="lagoon" size={76} />
            <T variant="title">{m.preferred_name ? `${m.preferred_name} ${m.last_name}` : m.full_name}</T>
            <T variant="callout" tone="ink3">
              {m.email}
            </T>
            <T variant="calloutStrong" tone="ink2">
              {{ student: "Student", teacher: "Teacher", staff: "Staff" }[m.kind]}
              {m.institution ? ` · ${m.institution.name}` : ""}
            </T>
          </View>

          <Group title="Appearance">
            <Appearance me={m} />
          </Group>

          <Group title="What to call you">
            <PreferredName me={m} />
          </Group>

          {m.sections.length ? (
            <Group title={m.kind === "teacher" ? "Subjects you teach" : "Your subjects"}>
              <Card padded={false}>
                {m.sections.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 && <Divider inset={16} />}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
                      <Avatar text={s.code.slice(0, 2).toUpperCase()} color={s.color} size={36} />
                      <View style={{ flex: 1 }}>
                        <T variant="bodyStrong">
                          {s.course_code} · {s.code}
                        </T>
                        <T variant="callout" tone="ink3" numberOfLines={1}>
                          {s.course_title} · {s.term}
                        </T>
                      </View>
                      {s.teaching ? (
                        <T variant="caption" tone="accentInk">
                          Teaching
                        </T>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>
            </Group>
          ) : null}

          <Group title="Notifications">
            <Preferences />
          </Group>

          <Group title="More">
            <Card padded={false}>
              <Row icon="chart" label="Marks and attendance" onPress={() => router.push("/progress")} />
              {showRequests ? (
                <>
                  <Divider inset={52} />
                  <Row icon="swap" label="Class requests" onPress={() => router.push("/requests")} />
                </>
              ) : null}
              <Divider inset={52} />
              <Row icon="bell" label="Notifications" onPress={() => router.push("/notifications")} />
              <Divider inset={52} />
              <Row icon="user" label="Account and security" onPress={() => router.push("/security")} />
            </Card>
            <T variant="callout" tone="ink3" style={{ paddingHorizontal: 4, marginTop: 8 }}>
              Managing sections, subjects, people and CRs lives on the CampusVerse website.
            </T>
          </Group>

          <Button label="Sign out" icon="logout" variant="danger" onPress={confirmSignOut} />
          <T variant="caption" tone="ink3" style={{ textAlign: "center", fontWeight: "400" }}>
            CampusVerse {Constants.expoConfig?.version ?? ""} · {new URL(API_URL).host}
          </T>
        </ScrollView>
      )}
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="caption" tone="ink3" accessibilityRole="header" style={{ textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 4 }}>
        {title}
      </T>
      {children}
    </View>
  );
}

function Row({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const p = useTheme();
  return (
    <Press accessibilityRole="button" scaleTo={0.99} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, minHeight: 52 }}>
      <Icon name={icon} size={20} color={p.ink2} />
      <T variant="body" style={{ flex: 1 }}>
        {label}
      </T>
      <Icon name="chevron" size={18} color={p.ink3} />
    </Press>
  );
}

function Appearance({ me }: { me: Me }) {
  const qc = useQueryClient();
  async function set(appearance: "light" | "dark") {
    // Show it at once; the account keeps it for every device.
    qc.setQueryData<Me>(["me"], (old) => (old ? { ...old, appearance } : old));
    try {
      await apiFetch("/api/me/appearance", { method: "PUT", body: JSON.stringify({ appearance }) });
    } catch {
      qc.invalidateQueries({ queryKey: ["me"] });
    }
  }
  return (
    <Segmented
      value={me.appearance}
      onChange={set}
      options={[
        { key: "light", label: "Light" },
        { key: "dark", label: "Dark" },
      ]}
    />
  );
}

function PreferredName({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [name, setName] = useState(me.preferred_name);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== me.preferred_name;

  async function save() {
    setState("saving");
    setError(null);
    try {
      const updated = await apiFetch<Me>("/api/me", { method: "PATCH", body: JSON.stringify({ preferred_name: name.trim() }) });
      qc.setQueryData(["me"], updated);
      setState("saved");
    } catch (err) {
      setError(errorDetail(err, "Couldn't save. Try again."));
      setState("idle");
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Field
        label="Preferred name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setState("idle");
        }}
        placeholder={me.first_name}
        error={error}
        returnKeyType="done"
        onSubmitEditing={() => changed && save()}
      />
      <T variant="callout" tone="ink3">
        Shown in chats and greetings instead of {me.first_name}. Your official name stays on records.
      </T>
      {changed || state === "saved" ? (
        <Button
          label={state === "saved" && !changed ? "Saved" : "Save"}
          variant={state === "saved" && !changed ? "secondary" : "primary"}
          busy={state === "saving"}
          disabled={!changed}
          onPress={save}
        />
      ) : null}
    </Card>
  );
}

function Preferences() {
  const qc = useQueryClient();
  const prefs = useNotificationPreferences();

  async function toggle(pref: NotificationPreference, channel: "in_app" | "email", value: boolean) {
    const key = ["notifications", "preferences"];
    qc.setQueryData<NotificationPreference[]>(key, (list) => list?.map((x) => (x.key === pref.key ? { ...x, [channel]: value } : x)));
    try {
      const saved = await apiFetch<NotificationPreference[]>("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ changes: { [pref.key]: { [channel]: value } } }),
      });
      qc.setQueryData(key, saved);
    } catch (err) {
      qc.invalidateQueries({ queryKey: key });
      Alert.alert("Couldn't change that", errorDetail(err, "Try again."));
    }
  }

  if (prefs.isPending) return <Skeleton height={200} />;
  if (!prefs.data?.length) return null;
  return (
    <Card padded={false}>
      <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
        <View style={{ flex: 1 }} />
        <T variant="caption" tone="ink3" style={{ width: 60, textAlign: "center" }}>
          App
        </T>
        <T variant="caption" tone="ink3" style={{ width: 60, textAlign: "center" }}>
          Email
        </T>
      </View>
      {prefs.data.map((pref, i) => (
        <View key={pref.key}>
          {i > 0 && <Divider inset={14} />}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 4 }}>
            <View style={{ flex: 1, paddingRight: 6 }}>
              <T variant="bodyStrong">{pref.label}</T>
              {pref.detail ? (
                <T variant="callout" tone="ink3">
                  {pref.detail}
                </T>
              ) : null}
            </View>
            {(["in_app", "email"] as const).map((channel) => (
              <View key={channel} style={{ width: 60, alignItems: "center" }}>
                <Toggle
                  label={`${pref.label} ${channel === "in_app" ? "in the app" : "by email"}`}
                  value={pref[channel]}
                  disabled={pref.locked}
                  onChange={(v) => toggle(pref, channel, v)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </Card>
  );
}
