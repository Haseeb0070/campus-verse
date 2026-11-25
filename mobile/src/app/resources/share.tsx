import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileRow } from "@/components/files";
import { ChoiceField, FormError, TextArea } from "@/components/form";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Chip, Empty, Field, Segmented, Skeleton, T } from "@/components/ui";
import { errorDetail, type UploadFile } from "@/lib/api";
import { pickFiles } from "@/lib/files";
import { KIND_LABEL, type ResourceKind, useShareOptions, useShareResource } from "@/lib/resources";
import { useTheme } from "@/theme";

const KINDS = (Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => ({ key: k, label: KIND_LABEL[k] }));

/** Share a file or a link with a course: every section of it, or some. */
export default function ShareResourceScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const options = useShareOptions();
  const share = useShareResource();
  const courses = options.data?.courses ?? [];
  const [courseId, setCourseId] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null); // null: every section, by default
  const [kind, setKind] = useState<ResourceKind>("slides");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<"file" | "link">("file");
  const [file, setFile] = useState<UploadFile | null>(null);
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const course = courses.find((c) => c.offering_id === courseId) ?? (courses.length === 1 ? courses[0] : undefined);
  const allKeys = course ? course.sections.map((s) => s.key) : [];
  const wholeKey = course ? `offering:${course.offering_id}` : "";
  const targets = picked ?? allKeys;

  function toggle(key: string) {
    // The whole course stands in for every section, including ones added later.
    if (key === wholeKey) setPicked(targets.includes(wholeKey) ? allKeys : [wholeKey]);
    else setPicked(targets.includes(key) ? targets.filter((k) => k !== key) : [...targets.filter((k) => k !== wholeKey), key]);
  }

  async function choose() {
    const got = await pickFiles(false);
    if (got?.[0]) {
      setFile(got[0]);
      setErrors(({ file: _, ...rest }) => rest);
    }
  }

  function submit() {
    const e: Record<string, string> = {};
    const max = options.data?.max_mb ?? 20;
    if (!course) e.course = "Choose a course.";
    if (course && targets.length === 0) e.targets = "Choose at least one section.";
    if (!title.trim()) e.title = "Give it a title.";
    if (source === "file" && !file) e.file = "Choose a file.";
    if (source === "file" && file && (file.size ?? 0) > max * 1024 * 1024) e.file = `Files can be up to ${max} MB.`;
    if (source === "link" && !/^https?:\/\/\S+\.\S+/.test(url.trim())) e.url = "Paste the full address, starting with https://.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length || !course) return;
    share.mutate(
      {
        offeringId: course.offering_id,
        title: title.trim(),
        kind,
        description,
        targets,
        file: source === "file" ? file : null,
        url: url.trim(),
      },
      {
        onSuccess: (r) => router.replace({ pathname: "/resources/[id]", params: { id: String(r.id) } }),
        onError: (err) => setFormError(errorDetail(err, "Couldn't share it. Try again.")),
      },
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Share material" subtitle="Slides, notes, readings or a link" />
      {options.isPending ? (
        <View style={{ padding: 16 }}>
          <Skeleton height={300} />
        </View>
      ) : !courses.length ? (
        <Empty icon="file" title="Nothing to share with" body="You can share material with the courses you teach." />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
          <Card style={{ gap: 16 }}>
            <ChoiceField
              label="Course"
              value={course?.offering_id ?? null}
              onChange={(v) => {
                setCourseId(v);
                setPicked(null);
              }}
              error={errors.course}
              options={courses.map((c) => ({ key: c.offering_id, label: `${c.course_code} · ${c.course_title}` }))}
            />
            {course ? (
              <View style={{ gap: 8 }}>
                <T variant="calloutStrong" tone="ink2">
                  For
                </T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {course.whole_course ? (
                    <Chip label={`Every ${course.course_code} section`} on={targets.includes(wholeKey)} onPress={() => toggle(wholeKey)} />
                  ) : null}
                  {course.sections.map((s) => (
                    <Chip key={s.key} label={s.code} on={targets.includes(s.key) || targets.includes(wholeKey)} onPress={() => toggle(s.key)} />
                  ))}
                </View>
                <FormError text={errors.targets} />
              </View>
            ) : null}
          </Card>

          <Card style={{ gap: 16 }}>
            <ChoiceField label="Type" value={kind} onChange={setKind} options={KINDS} />
            <Field label="Title" value={title} onChangeText={setTitle} maxLength={200} placeholder="Week 4 slides: sorting" error={errors.title} />
            <TextArea
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              maxLength={2000}
              minHeight={90}
              placeholder="What it covers, or what to read before class."
            />
          </Card>

          <Card style={{ gap: 12 }}>
            <Segmented
              value={source}
              onChange={setSource}
              options={[
                { key: "file", label: "A file" },
                { key: "link", label: "A link" },
              ]}
            />
            {source === "file" ? (
              <>
                {file ? <FileRow f={file} onRemove={() => setFile(null)} /> : null}
                <Button label={file ? "Choose another file" : "Choose a file"} icon="attach" variant="secondary" onPress={choose} />
                <T variant="caption" tone="ink3" style={{ fontWeight: "400", textAlign: "center" }}>
                  PDF, slides, documents, images or code, up to {options.data?.max_mb ?? 20} MB.
                </T>
                <FormError text={errors.file} />
              </>
            ) : (
              <Field
                label="Link"
                value={url}
                onChangeText={setUrl}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                error={errors.url}
              />
            )}
          </Card>

          <FormError text={formError} />
          <Button label="Share" busy={share.isPending} onPress={submit} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
