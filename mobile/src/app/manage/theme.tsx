import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChoiceField, FormError, SwitchRow } from "@/components/form";
import { asSite, CustomEditor, GuideColourRow, GuideSwatches, PresetPicker, ThemePreview } from "@/components/manage-theme";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Empty, Failed, Field, Skeleton, T } from "@/components/ui";
import { apiFetch, errorDetail } from "@/lib/api";
import { type AdminTheme, CORNERS, type Corners, CUSTOM_KEYS, type CustomColours, HEX, useAdminTheme } from "@/lib/manage-admin";
import { useMe } from "@/lib/queries";
import { buildPalette, type Mode, useTheme } from "@/theme";

const PARTS = [
  { key: "guide_body", label: "Body", name: "body" },
  { key: "guide_cap", label: "Cap", name: "cap" },
  { key: "guide_tassel", label: "Tassel", name: "tassel" },
] as const;

/** Manage → Theme: the look of CampusVerse for everyone at the institution. */
export default function ThemeScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const roles = useMe().data?.roles;
  const allowed = roles ? roles.includes("institution_admin") : true;
  const saved = useAdminTheme();
  // Unsaved changes; none means the saved theme as it is.
  const [edit, setEdit] = useState<AdminTheme | null>(null);
  const draft = edit ?? saved.data ?? null;
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation({
    mutationFn: (theme: AdminTheme) => apiFetch<AdminTheme>("/api/manage/theme", { method: "PUT", body: JSON.stringify(theme) }),
    onSuccess: (theme) => {
      qc.setQueryData(["manage", "theme"], theme);
      // The app's own look (and the profile, which shows the guide card only when renaming is
      // allowed) fetch again, so the new theme shows at once.
      qc.invalidateQueries({ queryKey: ["theme"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setEdit(null);
      setMessage({ ok: true, text: "Saved. Everyone sees the new look on their next page." });
    },
    onError: (err) => setMessage({ ok: false, text: errorDetail(err, "Couldn't save. Try again.") }),
  });

  const header = (
    <StackHeader title="Theme" subtitle="The look of CampusVerse for everyone at your institution" />
  );

  if (!allowed || saved.isError || !draft) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}>
          {!allowed ? (
            <Empty icon="sun" title="Not for you" body="The theme is set by your institution's admins." />
          ) : saved.isError ? (
            <Failed message="Couldn't load the theme settings." onRetry={() => saved.refetch()} />
          ) : (
            <>
              <Skeleton height={320} />
              <Skeleton height={200} />
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const set = (patch: Partial<AdminTheme>) => {
    setMessage(null);
    setEdit({ ...draft, ...patch });
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(saved.data);
  const guideName = draft.guide_name.trim();
  const nameError = !guideName ? "Give the guide a name." : guideName.length > 24 ? "Keep it to 24 characters or fewer." : null;
  const badCustom =
    draft.preset === "custom" && (["light", "dark"] as const).some((m) => CUSTOM_KEYS.some((k) => !HEX.test(draft.custom[m]?.[k] ?? "")));
  const colourError = PARTS.some((x) => draft[x.key] && !HEX.test(draft[x.key])) || badCustom ? "Colours look like #b4532a." : null;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>
        <T variant="callout" tone="ink2" style={{ paddingHorizontal: 4 }}>
          The look of CampusVerse for everyone at your institution: the app, the sign-in page and the landing page. Each person still
          picks light or dark for themselves.
        </T>

        <ThemePreview draft={draft} />

        <Card style={{ gap: 12 }}>
          <View>
            <T variant="headline" accessibilityRole="header">
              Built-in themes
            </T>
            <T variant="callout" tone="ink2">
              Changes the main colour and the deep colour of the sidebar and cards.
            </T>
          </View>
          <PresetPicker draft={draft} onPick={set} />
          {draft.preset === "custom" && draft.custom.light && draft.custom.dark ? (
            <CustomEditor custom={draft.custom as Record<Mode, CustomColours>} onChange={(custom) => set({ custom })} />
          ) : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <View>
            <T variant="headline" accessibilityRole="header">
              Cards
            </T>
            <T variant="callout" tone="ink2">
              How the panels across the app look: the notices, the Today card, chats and settings. The preview above shows each change
              straight away.
            </T>
          </View>
          <SwitchRow
            label="Border around cards in light mode"
            detail="A thin line around each card on light pages"
            value={draft.card_borders !== false}
            onChange={(v) => set({ card_borders: v })}
          />
          <SwitchRow
            label="Border around cards in dark mode"
            detail="Set on its own: a line that suits light pages can be loud on dark"
            value={(draft.card_borders_dark ?? draft.card_borders) !== false}
            onChange={(v) => set({ card_borders_dark: v })}
          />
          <SwitchRow
            label="Shadow under cards"
            detail="A soft shadow that lifts cards off the page"
            value={draft.card_shadows !== false}
            onChange={(v) => set({ card_shadows: v })}
          />
          <ChoiceField<Corners>
            label="Corners"
            hint="Cards, buttons and fields"
            value={draft.corners ?? "round"}
            onChange={(v) => set({ corners: v })}
            options={CORNERS}
          />
        </Card>

        <Card style={{ gap: 8 }}>
          <View>
            <T variant="headline" accessibilityRole="header">
              Guide in the app
            </T>
            <T variant="callout" tone="ink2">
              After signing in, {guideName || "the guide"} waits in a corner of the app. Tap it to ask about your next class, work that is
              due, new notices and unread messages.
            </T>
          </View>
          <SwitchRow label="Show in the app" value={draft.helper_enabled} onChange={(v) => set({ helper_enabled: v })} />
        </Card>

        <Card style={{ gap: 12 }}>
          <View>
            <T variant="headline" accessibilityRole="header">
              Landing page guide
            </T>
            <T variant="callout" tone="ink2">
              The little character that walks around the landing page, visits what people press and says a line about each part of the
              page.
            </T>
          </View>
          <SwitchRow label="Show the guide" value={draft.guide_enabled} onChange={(v) => set({ guide_enabled: v })} />
          <View style={{ gap: 12, opacity: draft.guide_enabled ? 1 : 0.5 }}>
            <GuideSwatches draft={draft} />
            <View style={{ gap: 4 }}>
              <Field
                label="Name"
                value={draft.guide_name}
                maxLength={24}
                onChangeText={(v) => set({ guide_name: v })}
                error={nameError}
              />
              {!nameError ? (
                <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
                  Up to 24 characters. It greets visitors by this name.
                </T>
              ) : null}
            </View>
            <SwitchRow
              label="Let people name their own guide"
              detail={`Off: everyone sees ${guideName || "this name"}. On: each person can pick a name on their profile, and ${
                guideName || "this name"
              } stays for everyone who doesn't.`}
              value={draft.guide_rename}
              onChange={(v) => set({ guide_rename: v })}
            />
            {PARTS.map((part) => (
              <GuideColourRow
                key={part.key}
                label={part.label}
                value={draft[part.key]}
                themeColour={buildPalette("light", asSite({ ...draft, [part.key]: "" })).guide[part.name]}
                onChange={(v) => set({ [part.key]: v } as Partial<AdminTheme>)}
              />
            ))}
          </View>
        </Card>
      </ScrollView>

      {/* Save stays in reach under the long form. */}
      <View
        style={{
          backgroundColor: p.surface,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: p.line,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: insets.bottom + 10,
          gap: 8,
        }}
      >
        {message && !message.ok ? (
          <FormError text={message.text} />
        ) : (
          <T variant="caption" tone="ink2" accessibilityLiveRegion="polite" style={{ fontWeight: "400" }}>
            {colourError ?? message?.text ?? (changed ? "Not saved yet. The preview shows the change." : "This is what everyone sees.")}
          </T>
        )}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {changed && saved.data ? (
            <Button
              label="Undo changes"
              variant="secondary"
              onPress={() => {
                setEdit(null);
                setMessage(null);
              }}
            />
          ) : null}
          <Button
            label={save.isPending ? "Saving…" : "Save theme"}
            busy={save.isPending}
            disabled={!changed || Boolean(nameError) || Boolean(colourError) || save.isPending}
            onPress={() => save.mutate({ ...draft, guide_name: guideName })}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
