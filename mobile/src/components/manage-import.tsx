import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ChoiceField, FormError, Sheet, SwitchRow } from "@/components/form";
import { Button, Card, Divider, Field, Pill, Press, Segmented, T } from "@/components/ui";
import { apiFetch, errorDetail } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import {
  IMPORT_KINDS,
  type ImportKind,
  type ImportRow,
  type ImportRun,
  resultText,
  SCHEDULES,
  type SyncSource,
  useSyncSources,
} from "@/lib/manage-admin";
import { font, radius, useTheme } from "@/theme";

type Filter = "changes" | "problems" | "all";

const STATUS: Record<ImportRow["status"], { label: string; tone: "success" | "accent" | "neutral" | "danger" }> = {
  new: { label: "New", tone: "success" },
  update: { label: "Update", tone: "accent" },
  unchanged: { label: "Unchanged", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
};

/** One import run: what the file would change, row by row, and (while it's a dry run) apply or discard. */
export function ImportRunView({
  run,
  tz,
  busy,
  onAct,
}: {
  run: ImportRun;
  tz?: string;
  busy: string | null;
  onAct: (a: "apply" | "discard") => void;
}) {
  const p = useTheme();
  const [filter, setFilter] = useState<Filter>("changes");
  const [confirm, setConfirm] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const s = run.summary;
  const changes = (s.new ?? 0) + (s.update ?? 0);
  // Applying a file with no changes still records that the data was confirmed up to date.
  const action = changes
    ? `Apply ${changes} ${changes === 1 ? "change" : "changes"}`
    : `Confirm ${s.unchanged ?? 0} unchanged ${s.unchanged === 1 ? "row" : "rows"}`;
  const nothing = changes + (s.unchanged ?? 0) === 0;
  const rows = (run.rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "problems" ? r.status === "error" || !!r.clash : r.status === "new" || r.status === "update",
  );
  const tiles: [string, number | undefined, string][] = [
    ["Rows read", s.rows, p.ink],
    ["New", s.new, p.success],
    ["Updates", s.update, p.accentInk],
    ["Unchanged", s.unchanged, p.ink2],
    ["Errors", s.error, p.danger],
    ...(run.kind === "timetable" ? [["Room clashes", s.clash, p.warnInk] as [string, number | undefined, string]] : []),
  ];

  return (
    <View style={{ gap: 12 }} accessibilityLabel="Import preview">
      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <T variant="title" accessibilityRole="header">
          {IMPORT_KINDS[run.kind].label} · {run.source ?? run.file_name}
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Pill
            tone={run.status === "preview" ? "warn" : run.status === "applied" ? "success" : "neutral"}
            label={
              run.status === "preview"
                ? "Dry run · nothing changed yet"
                : run.status === "applied"
                  ? `Applied ${run.applied_at ? formatDateTime(run.applied_at, tz) : ""}`
                  : "Discarded"
            }
          />
          {run.term ? (
            <T variant="caption" tone="ink2">
              {run.term}
            </T>
          ) : null}
        </View>
      </View>

      {run.status === "preview" && run.held_reason ? (
        <View style={{ backgroundColor: p.warnBg, borderRadius: radius.md, padding: 12 }}>
          <T variant="callout" style={{ color: p.warnInk }}>
            <T variant="calloutStrong" style={{ color: p.warnInk }}>
              Waiting for you:
            </T>{" "}
            {run.held_reason}
          </T>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {tiles.map(([text, value, colour]) => (
          <Card key={text} style={{ flexGrow: 1, flexBasis: "30%", padding: 12, gap: 2 }}>
            <T variant="caption" tone="ink2">
              {text}
            </T>
            <T variant="headline" style={{ color: colour, fontSize: 22, lineHeight: 26, fontVariant: ["tabular-nums"] }}>
              {value ?? 0}
            </T>
          </Card>
        ))}
      </View>

      <Card style={{ gap: 12 }}>
        <T variant="headline" accessibilityRole="header">
          Rows
        </T>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "changes", label: "Changes" },
            { key: "problems", label: "Problems" },
            { key: "all", label: "All" },
          ]}
        />
        {rows.length === 0 ? (
          <T variant="callout" tone="ink2">
            Nothing in this view.
          </T>
        ) : (
          rows.map((r, i) => (
            <View key={r.line} style={{ gap: 10 }}>
              {i > 0 ? <Divider /> : null}
              <RowItem r={r} />
            </View>
          ))
        )}
        {(run.not_in_file?.length ?? 0) > 0 ? (
          <View style={{ gap: 6 }}>
            <Divider />
            <Press
              accessibilityRole="button"
              accessibilityState={{ expanded: showMissing }}
              onPress={() => setShowMissing((v) => !v)}
              scaleTo={0.99}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <T variant="calloutStrong" tone="ink2">
                {s.not_in_file} {IMPORT_KINDS[run.kind].missing} · {showMissing ? "Hide" : "Show"}
              </T>
            </Press>
            {showMissing ? (
              <T variant="callout" tone="ink2">
                {run.not_in_file?.join(" · ")}
              </T>
            ) : null}
          </View>
        ) : null}
      </Card>

      {run.status === "preview" ? (
        <Card style={{ gap: 12 }}>
          <T variant="body">
            <T variant="bodyStrong">
              {action}
              {s.error ? ` and skip ${s.error} ${s.error === 1 ? "row" : "rows"} with errors` : ""}.
            </T>{" "}
            {changes ? "Nothing is deleted." : "This marks the data as just synchronized."}
          </T>
          {confirm ? (
            <Button label="Yes, apply now" busy={busy === "apply"} disabled={busy !== null || nothing} onPress={() => onAct("apply")} />
          ) : (
            <Button label={action} disabled={nothing} onPress={() => setConfirm(true)} />
          )}
          <Button label="Discard" variant="secondary" busy={busy === "discard"} disabled={busy !== null} onPress={() => onAct("discard")} />
        </Card>
      ) : null}
    </View>
  );
}

function RowItem({ r }: { r: ImportRow }) {
  const p = useTheme();
  const changes = Object.entries(r.changes);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pill label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
        <T variant="caption" tone="ink3" style={{ fontVariant: ["tabular-nums"] }}>
          Line {r.line}
        </T>
      </View>
      <T variant="calloutStrong">{r.label}</T>
      {r.detail ? (
        <T variant="callout" tone="ink2">
          {r.detail}
        </T>
      ) : null}
      {r.message ? (
        <T variant="callout" tone={r.status === "error" ? "danger" : "ink2"}>
          {r.message}
        </T>
      ) : null}
      {changes.map(([k, [a, b]]) => (
        <T key={k} variant="callout" tone="ink2">
          {k.replace("_", " ")}:{" "}
          <T variant="callout" tone="ink3" style={{ textDecorationLine: "line-through" }}>
            {a || "blank"}
          </T>{" "}
          → <T variant="calloutStrong">{b}</T>
        </T>
      ))}
      {r.clash ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <Pill label="Clash" tone="warn" />
          <T variant="callout" style={{ flex: 1, color: p.ink }}>
            {r.clash}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- Sync sources ---------- */

/** Exports the institution publishes, fetched on a schedule and checked like an upload. */
export function SyncSources({ tz, onRun }: { tz?: string; onRun: (runId: number) => void }) {
  const p = useTheme();
  const queryClient = useQueryClient();
  const list = useSyncSources();
  const [editing, setEditing] = useState<SyncSource | "new" | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function runNow(s: SyncSource) {
    setBusy(s.id);
    setMessage(null);
    try {
      const run = await apiFetch<ImportRun>(`/api/manage/sync-sources/${s.id}/run`, { method: "POST" });
      setMessage({
        ok: true,
        text: run.status === "applied" ? `${s.name}: applied ${resultText(run.result).toLowerCase()}.` : `${s.name}: preview ready above.`,
      });
      onRun(run.id);
    } catch (err) {
      setMessage({ ok: false, text: errorDetail(err, "The sync failed.") });
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: ["manage"] });
    }
  }

  async function toggle(s: SyncSource) {
    await apiFetch(`/api/manage/sync-sources/${s.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: s.name,
        kind: s.kind,
        url: s.url,
        schedule: s.schedule,
        auto_apply: s.auto_apply,
        purpose: s.purpose,
        is_active: !s.is_active,
        auth_header: null,
      }),
    }).catch(() => {});
    await queryClient.invalidateQueries({ queryKey: ["manage", "sync-sources"] });
  }

  return (
    <Card style={{ gap: 12 }}>
      <View>
        <T variant="headline" accessibilityRole="header">
          Sync sources
        </T>
        <T variant="callout" tone="ink2">
          Exports your institution publishes, fetched on a schedule and checked like an upload.
        </T>
      </View>
      <Button label="Add source" icon="plus" variant="secondary" onPress={() => setEditing("new")} />
      {message ? (
        <T variant="callout" accessibilityLiveRegion="polite" style={message.ok ? { color: p.success } : undefined} tone={message.ok ? "ink2" : "danger"}>
          {message.text}
        </T>
      ) : null}
      {list.isSuccess && list.data.length === 0 ? (
        <T variant="callout" tone="ink2">
          No sources yet. Without one, upload exports by hand above.
        </T>
      ) : null}
      {list.data?.map((s) => (
        <View key={s.id} style={{ gap: 10 }}>
          <Divider />
          <View style={{ gap: 2 }}>
            <T variant="bodyStrong" numberOfLines={1}>
              {s.name}
              {!s.is_active ? (
                <T variant="body" tone="ink3">
                  {" "}
                  · paused
                </T>
              ) : null}
            </T>
            <T variant="callout" tone="ink2">
              {IMPORT_KINDS[s.kind].label} · {SCHEDULES.find((x) => x.key === s.schedule)?.label}
              {s.auto_apply ? " · applies routine runs" : " · always reviewed"} · owner {s.owner}
            </T>
            <T variant="callout" tone={s.last_error ? "danger" : "ink2"}>
              {s.last_error
                ? `Last attempt failed ${s.last_attempt_at ? relativeTime(s.last_attempt_at) : ""}: ${s.last_error}`
                : s.last_success_at
                  ? `Last synced ${formatDateTime(s.last_success_at, tz)}`
                  : "Not run yet"}
            </T>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Run now" busy={busy === s.id} disabled={busy !== null} onPress={() => runNow(s)} style={{ flex: 1, minHeight: 40 }} />
            <Button label="Edit" variant="secondary" onPress={() => setEditing(s)} style={{ minHeight: 40 }} />
            <Button label={s.is_active ? "Pause" : "Resume"} variant="secondary" onPress={() => toggle(s)} style={{ minHeight: 40 }} />
          </View>
        </View>
      ))}
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add source" : "Edit source"}>
        {editing !== null ? (
          <SourceForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        ) : null}
      </Sheet>
    </Card>
  );
}

function SourceForm({ initial, onDone }: { initial?: SyncSource; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<ImportKind>(initial?.kind ?? "timetable");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [auth, setAuth] = useState("");
  const [schedule, setSchedule] = useState<SyncSource["schedule"]>(initial?.schedule ?? "daily");
  const [autoApply, setAutoApply] = useState(initial?.auto_apply ?? false);
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(initial ? `/api/manage/sync-sources/${initial.id}` : "/api/manage/sync-sources", {
        method: initial ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          kind,
          url,
          schedule,
          auto_apply: autoApply,
          purpose,
          is_active: initial?.is_active ?? true,
          auth_header: auth ? auth : initial ? null : "",
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["manage", "sync-sources"] });
      onDone();
    } catch (err) {
      setError(errorDetail(err, "Couldn't save the source."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Registrar timetable export" />
      <ChoiceField<ImportKind>
        label="Data"
        value={kind}
        onChange={setKind}
        options={(Object.keys(IMPORT_KINDS) as ImportKind[]).map((k) => ({ key: k, label: IMPORT_KINDS[k].label }))}
      />
      <Field
        label="Export address (https, CSV or Excel)"
        value={url}
        onChangeText={setUrl}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://registrar.example.edu/exports/timetable.csv"
      />
      <Field
        label="Authorization header (optional)"
        value={auth}
        onChangeText={setAuth}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        placeholder={initial?.has_auth ? "Saved. Type to replace it." : "Bearer …"}
      />
      <ChoiceField<SyncSource["schedule"]> label="How often" value={schedule} onChange={setSchedule} options={SCHEDULES} />
      <Field label="Purpose" value={purpose} onChangeText={setPurpose} maxLength={300} placeholder="Weekly timetable from the registrar's office" />
      <SwitchRow
        label="Apply routine runs automatically"
        detail="Runs with errors, unusually many changes or missing records always wait for review."
        value={autoApply}
        onChange={setAutoApply}
      />
      <FormError text={error} />
      <Button label={initial ? "Save" : "Add source"} busy={busy} onPress={save} />
      <Button label="Cancel" variant="secondary" onPress={onDone} />
    </ScrollView>
  );
}

/** A past run in the list: what it was and how it ended. */
export function RunLine({ r, current, tz, onPress }: { r: ImportRun; current: boolean; tz?: string; onPress: () => void }) {
  const p = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      onPress={onPress}
      scaleTo={0.99}
      style={{ borderRadius: radius.md, padding: 10, gap: 2, backgroundColor: current ? p.fill : "transparent" }}
    >
      <T variant="calloutStrong">
        {IMPORT_KINDS[r.kind].label}
        <T variant="callout" tone="ink2" style={{ fontFamily: font.regular }}>
          {" · "}
          {r.source ?? r.file_name} · {formatDateTime(r.created_at, tz)}
        </T>
      </T>
      <T variant="callout" tone="ink2">
        {r.status === "applied" ? `Applied: ${resultText(r.result)}` : r.status === "discarded" ? "Discarded" : "Waiting for review"}
      </T>
    </Press>
  );
}
