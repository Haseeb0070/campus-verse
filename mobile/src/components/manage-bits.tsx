import { ScrollView, View } from "react-native";
import { Chip, Empty } from "./ui";

/** Shown on a Manage screen the person isn't allowed to open, worded as the website words it. */
export function ManageNotAllowed() {
  return <Empty icon="people" title="This area is for institution admins" body="Ask an admin if you need access." />;
}

/** One row of filter chips that scrolls sideways when it doesn't fit. */
export function FilterChips<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: K; label: string }[];
  value: K;
  onChange: (v: K) => void;
  label: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      style={{ marginHorizontal: -16, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16 }}
    >
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8 }}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} on={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </ScrollView>
  );
}
