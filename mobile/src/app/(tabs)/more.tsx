import { router, type Href } from "expo-router";
import { View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { HeaderActions, Screen } from "@/components/Screen";
import { Stagger } from "@/components/Stagger";
import { Card, Divider, Press, T } from "@/components/ui";
import { useModerationSummary } from "@/lib/feed";
import { useMe } from "@/lib/queries";
import { useRepRequests, useRepsMine } from "@/lib/reps";
import { useTheme } from "@/theme";

type Item = { icon: IconName; label: string; detail: string; href: Href; badge?: number };

/** Everything that isn't a tab, in one place: the More tab in the bottom bar. */
export default function More() {
  const me = useMe().data;
  const reps = useRepsMine(!!me && me.kind !== "staff").data;
  const moderation = useModerationSummary().data;
  const teaches = !!me?.sections.some((s) => s.teaching);
  const isRep = Object.keys(reps?.sections ?? {}).length > 0;
  const waiting = (useRepRequests().data ?? []).filter((r) => r.can_decide || r.can_reply).length;
  const hasClasses = !me || me.kind !== "staff" || me.sections.length > 0;
  const isAdmin = !!me?.roles.includes("institution_admin");
  const coordinates = !!me?.roles.includes("department_coordinator");

  const campus: Item[] = [
    // Notices is its own tab for admins without classes; for everyone else it lives here.
    ...(hasClasses ? [{ icon: "pin" as const, label: "Notices", detail: "From your teachers, department and campus", href: "/notices" as Href }] : []),
    { icon: "heart", label: "Feed", detail: "Posts and questions from your college", href: "/feed" },
    { icon: "calendar", label: "Calendar", detail: "Events, exams and holidays", href: "/calendar" },
    { icon: "file", label: "Resources", detail: "Slides, notes and readings", href: "/resources" },
    { icon: "search", label: "Search", detail: "People, messages, notices and work", href: "/search" },
  ];
  const study: Item[] = [
    ...(me?.kind === "student"
      ? [{ icon: "chart" as const, label: "Marks and attendance", detail: "Your progress in every subject", href: "/progress" as Href }]
      : []),
    ...(teaches ? [{ icon: "people" as const, label: "Your subjects", detail: "Rosters, CR and GR", href: "/subjects" as Href }] : []),
    ...(me?.institution?.attendance_enabled && (teaches || isRep)
      ? [{ icon: "check" as const, label: "Take attendance", detail: "Mark a class present, late or absent", href: "/attendance" as Href }]
      : []),
    ...(teaches || isRep
      ? [{ icon: "swap" as const, label: "Class requests", detail: "Cancel or shift on CR and GR call", href: "/requests" as Href, badge: waiting }]
      : []),
  ];
  const admin: Item[] = [
    ...(moderation?.can_moderate
      ? [{ icon: "flag" as const, label: "Moderation", detail: "Reported posts and comments", href: "/moderation" as Href, badge: moderation.open }]
      : []),
    ...(isAdmin || coordinates
      ? [{ icon: "arch" as const, label: isAdmin ? "Manage" : "Department", detail: "People, courses, sections and reports", href: "/manage" as Href }]
      : []),
  ];
  const you: Item[] = [
    { icon: "bell", label: "Notifications", detail: "Everything that happened", href: "/notifications" },
    { icon: "user", label: "Profile and settings", detail: "Light or dark, notifications, your name", href: "/profile" },
    { icon: "moon", label: "Account and security", detail: "Password and two-step sign-in", href: "/security" },
  ];
  const groups: [string, Item[]][] = [
    ["Campus", campus],
    ["Study", study],
    ["Administration", admin],
    ["You", you],
  ];

  let index = 0;
  return (
    <Screen title="More" actions={<HeaderActions profile />} verse={false}>
      <View style={{ paddingHorizontal: 16, gap: 22, paddingBottom: 24 }}>
        {groups
          .filter(([, items]) => items.length > 0)
          .map(([title, items]) => (
            <View key={title} style={{ gap: 8 }}>
              <T variant="eyebrow" tone="ink2" style={{ paddingHorizontal: 4, textTransform: "uppercase" }}>
                {title}
              </T>
              <Card padded={false}>
                {items.map((item, i) => (
                  <Stagger key={item.label} index={index++}>
                    {i > 0 ? <Divider inset={60} /> : null}
                    <Row item={item} />
                  </Stagger>
                ))}
              </Card>
            </View>
          ))}
      </View>
    </Screen>
  );
}

function Row({ item }: { item: Item }) {
  const p = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={item.badge ? `${item.label}, ${item.badge} waiting` : item.label}
      scaleTo={0.99}
      onPress={() => router.push(item.href)}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 14, minHeight: 60 }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={item.icon} size={19} color={p.accentInk} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{item.label}</T>
        <T variant="callout" tone="ink2" numberOfLines={1}>
          {item.detail}
        </T>
      </View>
      {item.badge ? (
        <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
          <T variant="caption" style={{ color: p.onAccent }}>
            {item.badge}
          </T>
        </View>
      ) : null}
      <Icon name="chevron" size={18} color={p.ink3} />
    </Press>
  );
}
