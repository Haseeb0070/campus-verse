import { useLocalSearchParams } from "expo-router";
import { Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { categoryTone, whenText, whereText } from "@/components/events";
import { Icon, type IconName } from "@/components/Icon";
import { EventManage } from "@/components/event-manage";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Failed, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { useEvent, useRegistration } from "@/lib/events";
import { formatDateTime } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const tz = useMe().data?.institution?.timezone;
  const query = useEvent(Number(id));
  const registration = useRegistration(Number(id));
  const e = query.data;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title={e?.title ?? "Event"} subtitle={e?.category_label} />
      {query.isPending ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={190} />
          <Skeleton height={110} />
        </View>
      ) : !e ? (
        <Failed onRetry={() => query.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
          {e.status === "cancelled" ? (
            <View accessibilityRole="alert" style={{ backgroundColor: p.dangerSoft, borderRadius: radius.md, padding: 14, gap: 2 }}>
              <T variant="bodyStrong" style={{ color: p.danger }}>
                This has been cancelled
              </T>
              {e.cancel_reason ? (
                <T variant="callout" style={{ color: p.danger }}>
                  {e.cancel_reason}
                </T>
              ) : null}
            </View>
          ) : null}

          <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 20, gap: 14 }}>
            <View style={{ alignSelf: "flex-start", backgroundColor: categoryTone(e.category, p).bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <T variant="caption" style={{ color: categoryTone(e.category, p).fg, fontFamily: font.bold }}>
                {e.category_label}
              </T>
            </View>
            <T tone="onField" style={{ fontFamily: font.display, fontSize: 28, lineHeight: 32 }}>
              {e.title}
            </T>
            <Fact icon="clock" text={whenText(e, tz)} />
            {whereText(e) ? <Fact icon={e.mode === "online" ? "online" : "location"} text={whereText(e)} /> : null}
            <Fact icon="user" text={`Organised by ${e.organizer}${e.audiences.length ? ` · for ${e.audiences.join(", ")}` : ""}`} />
            {e.mode !== "in_person" && e.online_url && e.status !== "cancelled" ? (
              <Button label="Join online" icon="online" variant="field" onPress={() => Linking.openURL(e.online_url)} />
            ) : null}
          </View>

          {e.registration && e.status !== "cancelled" ? (
            <Card style={{ gap: 10 }}>
              <T variant="headline">Places</T>
              <T variant="callout" tone="ink2">
                {e.capacity ? `${e.going} of ${e.capacity} places taken` : `${e.going} going`}
                {e.waiting ? ` · ${e.waiting} on the waitlist` : ""}
                {e.registration_closes_at ? ` · sign-up closes ${formatDateTime(e.registration_closes_at, tz)}` : ""}
              </T>
              {e.my_status === "going" ? (
                <T variant="bodyStrong" style={{ color: p.success }}>
                  You have a place.
                </T>
              ) : e.my_status === "waitlisted" ? (
                <T variant="bodyStrong" style={{ color: p.warnInk }}>
                  You’re on the waitlist{e.my_waitlist_position ? `, number ${e.my_waitlist_position}` : ""}. If a place frees up, it’s yours and we’ll tell you.
                </T>
              ) : null}
              {registration.isError ? (
                <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
                  {errorDetail(registration.error, "Couldn't change your place. Try again.")}
                </T>
              ) : null}
              {e.my_status ? (
                <Button
                  label={e.my_status === "going" ? "Give up my place" : "Leave the waitlist"}
                  variant="secondary"
                  busy={registration.isPending}
                  onPress={() => registration.mutate(false)}
                />
              ) : e.registration_open ? (
                <Button
                  label={e.capacity !== null && e.going >= e.capacity ? "Join the waitlist" : "Sign up"}
                  busy={registration.isPending}
                  onPress={() => registration.mutate(true)}
                />
              ) : (
                <T variant="callout" tone="ink3">
                  Sign-up is closed.
                </T>
              )}
            </Card>
          ) : null}

          {e.description ? (
            <Card style={{ gap: 8 }}>
              <T variant="headline">About</T>
              <T variant="body" tone="ink2" selectable>
                {e.description}
              </T>
            </Card>
          ) : null}
          {e.can_manage ? <EventManage e={e} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const p = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name={icon} size={16} color={p.onFieldMuted} />
      </View>
      <T variant="body" tone="onField" style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}
