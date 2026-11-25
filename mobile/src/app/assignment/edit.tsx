import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileRow } from "@/components/files";
import { atDaysFromNow, ChoiceField, DateTimeField, FormError, Stepper, SwitchRow, TextArea } from "@/components/form";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Divider, Failed, Field, Skeleton, T } from "@/components/ui";
import { errorDetail, type UploadFile } from "@/lib/api";
import { useSaveAssignment, useTeaching } from "@/lib/coursework";
import { pickFiles } from "@/lib/files";
import { useAssignment, useUploadRules } from "@/lib/queries";
import type { Assignment } from "@/lib/types";
import { useTheme } from "@/theme";

/** Set work for a subject (no id) or change an assignment (?id=12). Same rules as the website's form. */
export default function AssignmentEditScreen() {
  const { id, section } = useLocalSearchParams<{ id?: string; section?: string }>();
  const p = useTheme();
  const existing = useAssignment(Number(id ?? 0), !!id);
  if (id && existing.isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <StackHeader title="Edit assignment" />
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={300} />
        </View>
      </View>
    );
  }
  if (id && !existing.data) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <StackHeader title="Edit assignment" />
        <Failed onRetry={() => existing.refetch()} />
      </View>
    );
  }
  return <AssignmentForm existing={id ? existing.data : undefined} sectionParam={section ? Number(section) : null} />;
}

const TYPES = [
  { key: "file" as const, label: "Files" },
  { key: "text" as const, label: "Written answer" },
  { key: "both" as const, label: "Either or both" },
];

function AssignmentForm({ existing, sectionParam }: { existing?: Assignment; sectionParam: number | null }) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const sections = useTeaching();
  const rules = useUploadRules().data;
  const save = useSaveAssignment();

  const [sectionId, setSectionId] = useState<number | null>(existing?.section_id ?? sectionParam);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [opens, setOpens] = useState(() => (existing ? new Date(existing.available_from) : new Date()));
  const [due, setDue] = useState(() => (existing ? new Date(existing.due_at) : atDaysFromNow(7)));
  const [type, setType] = useState<Assignment["submission_type"]>(existing?.submission_type ?? "file");
  const [points, setPoints] = useState(existing?.max_points ?? 10);
  const [attempts, setAttempts] = useState(existing?.max_attempts ?? 1);
  const [allowLate, setAllowLate] = useState(existing?.allow_late ?? false);
  const [lateUntil, setLateUntil] = useState(() =>
    existing?.late_until ? new Date(existing.late_until) : atDaysFromNow(9),
  );
  const [kept, setKept] = useState(existing?.attachments ?? []);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);

  const only = sections.data?.length === 1 ? sections.data[0].id : null;
  const chosen = sectionId ?? only;
  const isDraft = !existing || existing.status === "draft";

  async function add() {
    const picked = await pickFiles(true);
    if (!picked) return;
    const max = (rules?.max_mb ?? 20) * 1024 * 1024;
    const tooBig = picked.find((f) => (f.size ?? 0) > max);
    if (tooBig) return setErrors((e) => ({ ...e, files: `${tooBig.name} is over ${rules?.max_mb ?? 20} MB.` }));
    setErrors(({ files: _, ...rest }) => rest);
    setFiles((list) => [...list, ...picked]);
  }

  function submit(publish: boolean) {
    const e: Record<string, string> = {};
    if (!existing && !chosen) e.section = "Choose a subject.";
    if (!title.trim()) e.title = "Give the assignment a title.";
    if (due <= opens) e.due = "The due date has to be after it opens.";
    if (allowLate && lateUntil <= due) e.late = "The late deadline has to be after the due date.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setBusy(publish || !isDraft ? "publish" : "draft");
    save.mutate(
      {
        existing,
        sectionId: chosen,
        publish,
        removed: (existing?.attachments ?? []).filter((f) => !kept.some((k) => k.id === f.id)).map((f) => f.id),
        files,
        details: {
          title: title.trim(),
          instructions,
          available_from: opens.toISOString(),
          due_at: due.toISOString(),
          submission_type: type,
          max_points: points,
          max_attempts: attempts,
          allow_late: allowLate,
          late_until: allowLate ? lateUntil.toISOString() : null,
        },
      },
      {
        onSuccess: (newId) => {
          if (existing) router.back();
          else router.replace({ pathname: "/assignment/[id]", params: { id: String(newId) } });
        },
        onError: (err) => {
          setFormError(errorDetail(err, "Couldn't save the assignment. Try again."));
          setBusy(null);
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title={existing ? "Edit assignment" : "New assignment"}
        subtitle={existing ? `${existing.course_code} · ${existing.section_code}` : undefined}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
        <Card style={{ gap: 16 }}>
          {existing ? null : sections.isPending ? (
            <Skeleton height={60} />
          ) : (sections.data ?? []).length === 0 ? (
            <T variant="body" tone="ink2">
              You aren’t teaching any subjects yet, so there’s nowhere to set work.
            </T>
          ) : (
            <ChoiceField
              label="Subject"
              value={chosen}
              onChange={setSectionId}
              error={errors.section}
              options={(sections.data ?? []).map((s) => ({ key: s.id, label: `${s.course_code} · ${s.code}` }))}
            />
          )}
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={200} placeholder="Lab 3: Linked lists" error={errors.title} />
          <TextArea
            label="Instructions"
            value={instructions}
            onChangeText={setInstructions}
            placeholder="What to do, what to hand in, how it's marked."
          />
        </Card>

        <Card style={{ gap: 16 }}>
          <DateTimeField label="Opens" value={opens} onChange={setOpens} />
          <DateTimeField label="Due" value={due} onChange={setDue} error={errors.due} />
          <ChoiceField label="Students hand in" value={type} onChange={setType} options={TYPES} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Stepper label="Points" value={points} onChange={setPoints} min={1} max={1000} />
            <Stepper label="Attempts" value={attempts} onChange={setAttempts} min={1} max={10} />
          </View>
          <Divider />
          <SwitchRow label="Accept late work" detail="Hand-ins after the due date are marked late." value={allowLate} onChange={setAllowLate} />
          {allowLate ? (
            <DateTimeField label="Accept late work until" value={lateUntil} onChange={setLateUntil} error={errors.late} />
          ) : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <T variant="headline">Files for students</T>
          {kept.map((f) => (
            <FileRow key={f.id} f={f} path={`/api/assignments/files/${f.id}`} onRemove={() => setKept((l) => l.filter((k) => k.id !== f.id))} />
          ))}
          {files.map((f, i) => (
            <FileRow key={`${f.uri}-${i}`} f={f} onRemove={() => setFiles((l) => l.filter((_, j) => j !== i))} />
          ))}
          <Button label={kept.length || files.length ? "Add another file" : "Add files"} icon="attach" variant="secondary" onPress={add} />
          <FormError text={errors.files} />
        </Card>

        <FormError text={formError} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          {isDraft ? (
            <Button label="Save draft" variant="secondary" style={{ flex: 1 }} busy={busy === "draft"} disabled={busy !== null} onPress={() => submit(false)} />
          ) : null}
          <Button
            label={isDraft ? "Publish" : "Save changes"}
            style={{ flex: 1 }}
            busy={busy === "publish"}
            disabled={busy !== null}
            onPress={() => submit(isDraft)}
          />
        </View>
        {isDraft ? (
          <T variant="caption" tone="ink3" style={{ textAlign: "center", fontWeight: "400" }}>
            Students are told when it’s published. A draft stays with you.
          </T>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
