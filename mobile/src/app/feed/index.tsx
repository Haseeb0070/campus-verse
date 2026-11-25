import { useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { PostCard } from "@/components/feed";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Chip, Empty, Failed, IconButton, Skeleton, T } from "@/components/ui";
import { errorDetail, type UploadFile } from "@/lib/api";
import { useAudiences, useCreatePost, useFeed } from "@/lib/feed";
import { pickFiles } from "@/lib/files";
import { font, radius, useTheme } from "@/theme";

/** The campus feed: posts to your sections, course, department or the whole college. */
export default function Feed() {
  const p = useTheme();
  const feed = useFeed();
  const [writing, setWriting] = useState(false);
  const posts = feed.data?.pages.flat() ?? [];

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title="Campus feed"
        subtitle="Posts from your classes and campus"
        actions={writing ? null : <IconButton icon="pencil" label="Write a post" variant="accent" onPress={() => setWriting(true)} />}
      />
      <FlatList
        data={posts}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => feed.refetch()}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={writing ? <Composer onDone={() => setWriting(false)} /> : undefined}
        ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={p.accent} style={{ margin: 16 }} /> : undefined}
        renderItem={({ item }) => <PostCard post={item} />}
        ListEmptyComponent={
          feed.isPending ? (
            <View style={{ gap: 12 }}>
              <Skeleton height={160} />
              <Skeleton height={160} />
            </View>
          ) : feed.isError && !feed.data ? (
            <Failed onRetry={() => feed.refetch()} />
          ) : (
            <Empty
              icon="chat"
              title="Nothing posted yet"
              body="Posts to your subjects, courses and campus show here."
              action={<Button label="Write the first post" icon="pencil" onPress={() => setWriting(true)} style={{ marginTop: 6 }} />}
            />
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

function Composer({ onDone }: { onDone: () => void }) {
  const p = useTheme();
  const audiences = useAudiences();
  const create = useCreatePost();
  const [body, setBody] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setTargets((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  async function attach() {
    const picked = await pickFiles(true);
    if (picked) setFiles((list) => [...list, ...picked].slice(0, 4));
  }

  function post() {
    setError(null);
    if (!body.trim() && !files.length) return setError("Write something or add a photo.");
    if (!targets.length) return setError("Choose where to post.");
    create.mutate(
      { body: body.trim(), targets, files },
      { onSuccess: onDone, onError: (err) => setError(errorDetail(err, "Couldn't post it. Try again.")) },
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(180)} style={{ marginBottom: 4 }}>
      <Card style={{ gap: 12 }}>
        <T variant="headline">New post</T>
        <TextInput
          value={body}
          onChangeText={setBody}
          autoFocus
          multiline
          maxLength={4000}
          placeholder="Share something with your classes"
          placeholderTextColor={p.ink3}
          accessibilityLabel="Your post"
          textAlignVertical="top"
          style={{
            minHeight: 100,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: p.line,
            backgroundColor: p.bg,
            padding: 12,
            fontFamily: font.regular,
            fontSize: 15,
            lineHeight: 21,
            color: p.ink,
          }}
        />
        <T variant="calloutStrong" tone="ink2">
          Who sees it
        </T>
        {audiences.isPending ? (
          <Skeleton height={36} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(audiences.data ?? []).map((a) => (
              <Chip key={a.key} label={a.label} on={targets.includes(a.key)} onPress={() => toggle(a.key)} />
            ))}
          </ScrollView>
        )}
        {files.map((f, i) => (
          <View key={`${f.uri}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T variant="callout" numberOfLines={1} style={{ flex: 1 }}>
              {f.name}
            </T>
            <IconButton icon="close" label={`Remove ${f.name}`} variant="plain" size={36} onPress={() => setFiles((l) => l.filter((_, j) => j !== i))} />
          </View>
        ))}
        {error ? (
          <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <IconButton icon="attach" label="Add a photo or file" variant="fill" onPress={attach} />
          <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onDone} />
          <Button label="Post" style={{ flex: 1 }} busy={create.isPending} onPress={post} />
        </View>
      </Card>
    </Animated.View>
  );
}
