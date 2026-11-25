import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { apiFetch, errorDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Me } from "@/lib/types";
import { useTheme } from "@/theme";
import { ChoiceField, FormError, TextArea } from "./form";
import { Button, Card, Divider, Field, Pill, T } from "./ui";

/** The guide fields /api/me carries (the website's Me type has them; the app's didn't need them). */
type GuideMe = Me & { guide_name?: string; guide_rename?: boolean; guide_name_default?: string };

export function canRenameGuide(me: Me) {
  return !!(me as GuideMe).guide_rename;
}

/** Give Verse a name of your own; only you see it. Shown when the college allows it. */
export function GuideName({ me }: { me: Me }) {
  const qc = useQueryClient();
  const g = me as GuideMe;
  const [name, setName] = useState(g.guide_name ?? "");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation({
    mutationFn: (value: string) => apiFetch("/api/me/guide-name", { method: "PUT", body: JSON.stringify({ guide_name: value }) }),
    onSuccess: (_, value) => {
      const tidy = value.split(/\s+/).filter(Boolean).join(" ");
      setName(tidy);
      qc.setQueryData<GuideMe>(["me"], (m) => (m ? { ...m, guide_name: tidy } : m));
      qc.invalidateQueries({ queryKey: ["theme"] }); // the guide's name comes with the theme
      setStatus({ ok: true, text: tidy ? `Your guide is now ${tidy}.` : `Back to ${g.guide_name_default ?? "Verse"}.` });
    },
    onError: (err) => setStatus({ ok: false, text: errorDetail(err, "Couldn't save. Try again.") }),
  });
  const changed = name.trim() !== (g.guide_name ?? "");

  return (
    <Card style={{ gap: 12 }}>
      <Field
        label="Your guide's name"
        value={name}
        maxLength={24}
        placeholder={g.guide_name_default ?? "Verse"}
        onChangeText={(v) => {
          setName(v);
          setStatus(null);
        }}
      />
      <T variant="callout" tone="ink3">
        Only you see it. Up to 24 characters; leave it empty to use {g.guide_name_default ?? "Verse"}.
      </T>
      {status ? (
        <T variant="callout" tone={status.ok ? "accentInk" : "danger"} accessibilityLiveRegion="polite">
          {status.text}
        </T>
      ) : null}
      {changed ? <Button label="Save" busy={save.isPending} onPress={() => save.mutate(name.trim())} /> : null}
    </Card>
  );
}

type Topic = "name" | "email" | "enrollment" | "other";

const TOPICS: { key: Topic; label: string }[] = [
  { key: "name", label: "My name" },
  { key: "email", label: "My email" },
  { key: "enrollment", label: "My courses or sections" },
  { key: "other", label: "Something else" },
];

interface Correction {
  id: number;
  topic: Topic;
  topic_label: string;
  details: string;
  status: "open" | "resolved" | "declined";
  response: string;
  created_at: string;
  resolved_at: string | null;
}

const STATUS = {
  open: { label: "Waiting", tone: "neutral" as const },
  resolved: { label: "Fixed", tone: "success" as const },
  declined: { label: "Declined", tone: "danger" as const },
};

/** Something wrong on your record (name, email, enrollment)? Tell an admin, and see their answers. */
export function Corrections() {
  const p = useTheme();
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ["corrections", "mine"], queryFn: () => apiFetch<Correction[]>("/api/me/corrections") });
  const [topic, setTopic] = useState<Topic>("name");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const send = useMutation({
    mutationFn: () => apiFetch("/api/me/corrections", { method: "POST", body: JSON.stringify({ topic, details: details.trim() }) }),
    onSuccess: () => {
      setDetails("");
      setSent(true);
      qc.invalidateQueries({ queryKey: ["corrections", "mine"] });
    },
    onError: (err) => setError(errorDetail(err, "Couldn't send it. Try again.")),
  });

  return (
    <Card style={{ gap: 14 }}>
      <T variant="callout" tone="ink3">
        Your name, email and enrollment come from your institution. Tell an admin what to fix.
      </T>
      <ChoiceField label="What needs fixing" value={topic} onChange={setTopic} options={TOPICS} />
      <TextArea
        label="Details"
        value={details}
        maxLength={1000}
        minHeight={80}
        placeholder="What's wrong, and what it should be."
        onChangeText={(v) => {
          setDetails(v);
          setSent(false);
        }}
      />
      <FormError text={error} />
      {sent ? (
        <T variant="callout" tone="accentInk" accessibilityLiveRegion="polite">
          Sent. You’ll get a notification when it’s answered.
        </T>
      ) : null}
      <Button
        label="Send to admins"
        variant="secondary"
        busy={send.isPending}
        onPress={() => {
          setError(null);
          if (!details.trim()) return setError("Say what's wrong and what it should be.");
          send.mutate();
        }}
      />
      {mine.data?.length ? (
        <View style={{ gap: 10 }}>
          <Divider />
          {mine.data.map((c) => (
            <View key={c.id} style={{ backgroundColor: p.fill, borderRadius: 12, padding: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T variant="calloutStrong" style={{ flex: 1 }}>
                  {c.topic_label}
                </T>
                <Pill label={STATUS[c.status].label} tone={STATUS[c.status].tone} />
              </View>
              <T variant="callout" tone="ink2">
                {c.details}
              </T>
              {c.response ? (
                <T variant="callout" tone="ink2">
                  Answer: {c.response}
                </T>
              ) : null}
              <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
                Sent {formatDateTime(c.created_at)}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
