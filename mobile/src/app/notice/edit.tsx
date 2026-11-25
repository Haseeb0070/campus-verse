import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileRow } from "@/components/files";
import { ChoiceField, DateTimeField, FormError, SwitchRow, TextArea } from "@/components/form";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Chip, Divider, Failed, Field, Skeleton, T } from "@/components/ui";
import { errorDetail, type UploadFile } from "@/lib/api";
import { pickFiles } from "@/lib/files";
import { MAX_NOTICE_FILES, type MyNotice, noticeFilePath, useMyNotices, useNoticeAudiences, useReach, useSaveNotice } from "@/lib/notices";
import { useUploadRules } from "@/lib/queries";
import type { Audience } from "@/lib/types";
import { useTheme } from "@/theme";

/** Write a notice (no id) or change one of yours (?id=4). */
export default function NoticeEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const p = useTheme();
  const mine = useMyNotices(!!id);
  const existing = id ? mine.data?.find((n) => n.id === Number(id)) : undefined;
  if (id && !existing) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <StackHeader title="Edit notice" />
        {mine.isPending ? (
          <View style={{ padding: 16 }}>
            <Skeleton height={300} />
          </View>
        ) : (
          <Failed message="This notice isn't one of yours any more." onRetry={() => mine.refetch()} />
        )}
      </View>
    );
  }
  return <NoticeForm existing={existing} />;
}

function inHours(hours: number) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + hours);
  return d;
}

function NoticeForm({ existing }: { existing?: MyNotice }) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const audiences = useNoticeAudiences();
  const rules = useUploadRules().data;
  const save = useSaveNotice();
  const sent = existing?.status === "published";

  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [important, setImportant] = useState(existing?.priority === "important");
  const [targets, setTargets] = useState<string[]>(existing?.targets.map((t) => t.key) ?? []);
  const [when, setWhen] = useState<"now" | "later">(existing?.status === "scheduled" ? "later" : "now");
  const [publishAt, setPublishAt] = useState(() => (existing?.publish_at ? new Date(existing.publish_at) : inHours(18)));
  const [expires, setExpires] = useState(Boolean(existing?.expires_at));
  const [expiresAt, setExpiresAt] = useState(() => (existing?.expires_at ? new Date(existing.expires_at) : inHours(24 * 7)));
  const [kept, setKept] = useState(existing?.attachments ?? []);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const reach = useReach(targets);

  const groups = (audiences.data ?? []).reduce<Record<string, Audience[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a);
    return acc;
  }, {});

  function toggle(key: string) {
    setTargets((t) => (t.includes(key) ? t.filter((k) => k !== key) : [...t, key]));
    setErrors(({ targets: _, ...rest }) => rest);
  }

  async function add() {
    const picked = await pickFiles(true);
    if (!picked) return;
    const max = (rules?.max_mb ?? 20) * 1024 * 1024;
    const tooBig = picked.find((f) => (f.size ?? 0) > max);
    if (tooBig) return setErrors((e) => ({ ...e, files: `${tooBig.name} is over ${rules?.max_mb ?? 20} MB.` }));
    if (kept.length + files.length + picked.length > MAX_NOTICE_FILES) {
      return setErrors((e) => ({ ...e, files: `A notice can have up to ${MAX_NOTICE_FILES} files.` }));
    }
    setErrors(({ files: _, ...rest }) => rest);
    setFiles((list) => [...list, ...picked]);
  }

  function submit(send: boolean) {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Give the notice a title.";
    if (!body.trim()) e.body = "Write the notice text.";
    if (send && !sent && targets.length === 0) e.targets = "Choose who should see this notice.";
    const goesOut = sent ? new Date(existing?.published_at ?? Date.now()) : send && when === "later" ? publishAt : new Date();
    if (!sent && send && when === "later" && !(publishAt > new Date())) e.publishAt = "Pick a time in the future, or publish it now.";
    if (expires && !(expiresAt > goesOut)) e.expiresAt = "The take-down time has to be after it goes out.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setBusy(send ? "send" : "draft");
    save.mutate(
      {
        existing,
        draft: {
          title,
          body,
          important,
          targets,
          expiresAt: expires ? expiresAt : null,
          sendAt: send && !sent ? (when === "later" ? publishAt : "now") : null,
          removed: (existing?.attachments ?? []).filter((f) => !kept.some((k) => k.id === f.id)).map((f) => f.id),
          files,
        },
      },
      {
        onSuccess: () => (router.canGoBack() ? router.back() : router.replace("/notices")),
        onError: (err) => {
          setFormError(errorDetail(err, "Couldn't save the notice. Try again."));
          setBusy(null);
        },
      },
    );
  }

  const mainLabel = sent ? "Save changes" : when === "later" ? "Schedule" : "Publish";

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title={existing ? "Edit notice" : "New notice"} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
        <Card style={{ gap: 16 }}>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={200} placeholder="Mid-term moved to Thursday" error={errors.title} />
          <TextArea label="Notice" value={body} onChangeText={setBody} placeholder="What people need to know." error={errors.body} minHeight={150} />
          <SwitchRow label="Important" detail="Marked important on the board." value={important} onChange={setImportant} />
        </Card>

        <Card style={{ gap: 12 }}>
          <T variant="headline">Who sees it</T>
          {sent ? (
            <T variant="body" tone="ink2">
              {existing?.targets.map((t) => t.label).join(", ")}. A notice that has gone out keeps its audience.
            </T>
          ) : audiences.isPending ? (
            <Skeleton height={80} />
          ) : (
            Object.entries(groups).map(([group, list]) => (
              <View key={group} style={{ gap: 8 }}>
                <T variant="calloutStrong" tone="ink2">
                  {group}
                </T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {list.map((a) => (
                    <Chip key={a.key} label={a.label} on={targets.includes(a.key)} onPress={() => toggle(a.key)} />
                  ))}
                </View>
              </View>
            ))
          )}
          {!sent && targets.length ? (
            <T variant="callout" tone="ink3">
              Reaches {reach.data ? `${reach.data.people} ${reach.data.people === 1 ? "person" : "people"}` : "…"}
            </T>
          ) : null}
          <FormError text={errors.targets} />
        </Card>

        <Card style={{ gap: 14 }}>
          {!sent ? (
            <>
              <ChoiceField
                label="Send it"
                value={when}
                onChange={setWhen}
                options={[
                  { key: "now", label: "Now" },
                  { key: "later", label: "At a set time" },
                ]}
              />
              {when === "later" ? (
                <DateTimeField label="Goes out" value={publishAt} onChange={setPublishAt} minDate={new Date()} error={errors.publishAt} />
              ) : null}
              <Divider />
            </>
          ) : null}
          <SwitchRow label="Take it down later" detail="It leaves the board at this time." value={expires} onChange={setExpires} />
          {expires ? <DateTimeField label="Take down" value={expiresAt} onChange={setExpiresAt} error={errors.expiresAt} /> : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <T variant="headline">Files</T>
          {kept.map((f) => (
            <FileRow key={f.id} f={f} path={noticeFilePath(f.id)} onRemove={() => setKept((l) => l.filter((k) => k.id !== f.id))} />
          ))}
          {files.map((f, i) => (
            <FileRow key={`${f.uri}-${i}`} f={f} onRemove={() => setFiles((l) => l.filter((_, j) => j !== i))} />
          ))}
          {kept.length + files.length < MAX_NOTICE_FILES ? (
            <Button label={kept.length || files.length ? "Add another file" : "Add files"} icon="attach" variant="secondary" onPress={add} />
          ) : null}
          <FormError text={errors.files} />
        </Card>

        <FormError text={formError} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          {!sent ? (
            <Button label="Save draft" variant="secondary" style={{ flex: 1 }} busy={busy === "draft"} disabled={busy !== null} onPress={() => submit(false)} />
          ) : null}
          <Button label={mainLabel} style={{ flex: 1 }} busy={busy === "send"} disabled={busy !== null} onPress={() => submit(true)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
