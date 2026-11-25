import { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, View } from "react-native";
import { errorDetail, type UploadFile } from "@/lib/api";
import { pickFiles } from "@/lib/files";
import { KIND_LABEL, type Resource, type ResourceKind, useManageResource, useShareOptions } from "@/lib/resources";
import { FileRow } from "./files";
import { ChoiceField, FormError, Sheet, TextArea } from "./form";
import { Button, Card, Field, T } from "./ui";

const KINDS = (Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => ({ key: k, label: KIND_LABEL[k] }));

/** For whoever shared it: change its details, upload a new version, archive or restore it. */
export function ResourceManage({ r }: { r: Resource }) {
  const manage = useManageResource(r.id);
  const [sheet, setSheet] = useState<"edit" | "version" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function archive(on: boolean) {
    const go = () =>
      manage.mutate(
        { kind: on ? "archive" : "restore" },
        { onError: (err) => setError(errorDetail(err, "Couldn't change it. Try again.")) },
      );
    if (!on) return go();
    Alert.alert("Archive this?", "Students stop seeing it in their list. You can restore it later.", [
      { text: "Cancel", style: "cancel" },
      { text: "Archive", style: "destructive", onPress: go },
    ]);
  }

  return (
    <Card style={{ gap: 10 }}>
      <T variant="headline">Manage</T>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label="Edit details" icon="pencil" variant="secondary" style={{ flex: 1 }} onPress={() => setSheet("edit")} />
        {r.file ? (
          <Button label="New version" icon="refresh" variant="secondary" style={{ flex: 1 }} onPress={() => setSheet("version")} />
        ) : null}
      </View>
      {r.status === "archived" ? (
        <Button label="Restore" icon="arch" busy={manage.isPending} onPress={() => archive(false)} />
      ) : (
        <Button label="Archive" icon="arch" variant="danger" busy={manage.isPending} onPress={() => archive(true)} />
      )}
      <FormError text={error} />
      <EditSheet r={r} visible={sheet === "edit"} onClose={() => setSheet(null)} />
      <VersionSheet r={r} visible={sheet === "version"} onClose={() => setSheet(null)} />
    </Card>
  );
}

function EditSheet({ r, visible, onClose }: { r: Resource; visible: boolean; onClose: () => void }) {
  const manage = useManageResource(r.id);
  const [title, setTitle] = useState(r.title);
  const [description, setDescription] = useState(r.description);
  const [kind, setKind] = useState<ResourceKind>(r.kind);
  const [url, setUrl] = useState(r.url);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!title.trim()) return setError("Give it a title.");
    setError(null);
    manage.mutate(
      { kind: "details", title: title.trim(), description, resourceKind: kind, url: r.url ? url.trim() : null },
      { onSuccess: onClose, onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Edit details">
      <KeyboardAvoidingView behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={200} />
          <ChoiceField label="Type" value={kind} onChange={setKind} options={KINDS} />
          {r.url ? <Field label="Link" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" /> : null}
          <TextArea label="Description" value={description} onChangeText={setDescription} maxLength={2000} minHeight={90} />
          <FormError text={error} />
          <Button label="Save" busy={manage.isPending} onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

function VersionSheet({ r, visible, onClose }: { r: Resource; visible: boolean; onClose: () => void }) {
  const manage = useManageResource(r.id);
  const maxMb = useShareOptions().data?.max_mb ?? 20;
  const [file, setFile] = useState<UploadFile | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    const got = await pickFiles(false);
    if (got?.[0]) setFile(got[0]);
  }

  function upload() {
    if (!file) return setError("Choose the new file.");
    if ((file.size ?? 0) > maxMb * 1024 * 1024) return setError(`Files can be up to ${maxMb} MB.`);
    setError(null);
    manage.mutate(
      { kind: "version", file, note: note.trim() },
      {
        onSuccess: () => {
          setFile(null);
          setNote("");
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Couldn't upload it. Try again.")),
      },
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={`Upload version ${r.version + 1}`}>
      <KeyboardAvoidingView behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
          <T variant="callout" tone="ink2">
            Students get the new file. Version {r.version} stays in the history, so nothing is lost.
          </T>
          {file ? <FileRow f={file} onRemove={() => setFile(null)} /> : null}
          <Button label={file ? "Choose another file" : "Choose the new file"} icon="attach" variant="secondary" onPress={choose} />
          <Field label="What changed (optional, shown to students)" value={note} onChangeText={setNote} maxLength={200} placeholder="Fixed the example on slide 12" />
          <FormError text={error} />
          <Button label={`Upload version ${r.version + 1}`} busy={manage.isPending} onPress={upload} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}
