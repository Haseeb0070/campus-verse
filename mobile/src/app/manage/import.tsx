import { useQueryClient } from "@tanstack/react-query";
import { type ComponentRef, useRef, useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DownloadRow, FileRow } from "@/components/files";
import { FormError } from "@/components/form";
import { ImportRunView, RunLine, SyncSources } from "@/components/manage-import";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Empty, Segmented, Skeleton, T } from "@/components/ui";
import { apiFetch, appendFile, errorDetail, type UploadFile } from "@/lib/api";
import { pickFiles } from "@/lib/files";
import { IMPORT_KINDS, type ImportKind, type ImportRun, useImportRun, useImports } from "@/lib/manage-admin";
import { useMe } from "@/lib/queries";
import { useTheme } from "@/theme";

/** Smart Sync: upload a CSV or Excel export, review every change, then apply it; and the
 *  scheduled feeds that do the same on their own. */
export default function ImportScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const allowed = me ? me.roles.includes("institution_admin") : true;
  const runs = useImports();
  const [kind, setKind] = useState<ImportKind>("timetable");
  const [selected, setSelected] = useState<number | null>(null);
  const runId = selected ?? runs.data?.find((r) => r.status === "preview")?.id ?? null;
  const run = useImportRun(allowed ? runId : null);
  const [file, setFile] = useState<UploadFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  // Opening a run from further down brings its preview into view.
  const open = (id: number) => {
    setSelected(id);
    scroller.current?.scrollTo({ y: 0, animated: true });
  };

  async function choose() {
    const picked = await pickFiles(false).catch(() => null);
    if (picked?.[0]) {
      setFile(picked[0]);
      setError(null);
    }
  }

  async function upload() {
    if (!file) return setError("Choose a CSV or Excel file first.");
    setBusy("upload");
    setError(null);
    const form = new FormData();
    appendFile(form, "file", file);
    try {
      const created = await apiFetch<ImportRun>(`/api/manage/imports/${kind}`, { method: "POST", body: form });
      setSelected(created.id);
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["manage"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't read that file."));
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "apply" | "discard") {
    if (!runId) return;
    setBusy(action);
    setError(null);
    try {
      await apiFetch(`/api/manage/imports/${runId}/${action}`, { method: "POST" });
      setSelected(runId);
      await queryClient.invalidateQueries({ queryKey: ["manage"] });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
    } catch (err) {
      setError(errorDetail(err, "That didn't work. Try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Imports & sync" subtitle="Smart Sync · CSV or Excel exports and scheduled feeds" />
      <ScrollView
        ref={scroller}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        refreshControl={
          allowed ? (
            <RefreshControl
              refreshing={refreshing}
              tintColor={p.accent}
              colors={[p.accent]}
              onRefresh={async () => {
                setRefreshing(true);
                await queryClient.invalidateQueries({ queryKey: ["manage"] });
                setRefreshing(false);
              }}
            />
          ) : undefined
        }
      >
        {!allowed ? (
          <Empty icon="file" title="Not for you" body="Imports and sync are for your institution's admins." />
        ) : (
          <>
            <Card style={{ gap: 12 }}>
              <Segmented<ImportKind>
                value={kind}
                onChange={setKind}
                options={(Object.keys(IMPORT_KINDS) as ImportKind[]).map((k) => ({ key: k, label: IMPORT_KINDS[k].label }))}
              />
              <T variant="callout" tone="ink2">
                {`${IMPORT_KINDS[kind].about} You'll see every change before anything is saved, and nothing is ever deleted.`}
              </T>
              <DownloadRow label="Download template" path={`/api/manage/imports/${kind}/template.csv`} name={`${kind}-template.csv`} />
              {file ? (
                <FileRow f={file} onRemove={() => setFile(null)} />
              ) : (
                <Button label="Choose a CSV or Excel file" icon="attach" variant="secondary" onPress={choose} />
              )}
              <FormError text={error} />
              <Button label={busy === "upload" ? "Checking…" : "Preview import"} busy={busy === "upload"} disabled={busy !== null} onPress={upload} />
            </Card>

            {runId !== null && run.isPending ? <Skeleton height={260} /> : null}
            {run.data ? <ImportRunView key={run.data.id} run={run.data} tz={tz} busy={busy} onAct={act} /> : null}

            <SyncSources tz={tz} onRun={open} />

            {runs.isPending ? (
              <Skeleton height={120} />
            ) : (runs.data?.length ?? 0) > 0 ? (
              <Card style={{ gap: 4 }}>
                <T variant="headline" accessibilityRole="header" style={{ marginBottom: 4 }}>
                  Previous imports
                </T>
                <View style={{ gap: 2 }}>
                  {runs.data?.map((r) => (
                    <RunLine key={r.id} r={r} current={r.id === runId} tz={tz} onPress={() => open(r.id)} />
                  ))}
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
