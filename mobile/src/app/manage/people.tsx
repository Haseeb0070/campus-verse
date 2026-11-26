import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, RefreshControl, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DownloadRow } from "@/components/files";
import { ChoiceField, FormError, Sheet } from "@/components/form";
import { FilterChips, ManageNotAllowed } from "@/components/manage-bits";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Button, Card, Empty, Failed, Field, IconButton, Pill, Press, Skeleton, T } from "@/components/ui";
import { apiFetch, errorDetail } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import {
  type ManagedPerson,
  type PersonKind,
  roleLabel,
  useDebounced,
  useDepartments,
  useManageAccess,
  useManageAction,
  usePeople,
} from "@/lib/manage";
import { radius, useTheme } from "@/theme";

const KINDS: { value: "" | PersonKind; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "student", label: "Students" },
  { value: "teacher", label: "Teachers" },
  { value: "staff", label: "Staff" },
];

const ROLES = [
  { key: "department_coordinator", label: "Department coordinator" },
  { key: "moderator", label: "Moderator" },
  { key: "institution_admin", label: "Institution admin" },
];

/** Accounts, invites and roles: find someone, invite someone, fix their details or access. */
export default function PeopleScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const { loaded, admin } = useManageAccess();
  const params = useLocalSearchParams<{ q?: string }>();
  const [typed, setTyped] = useState(params.q ?? "");
  const q = useDebounced(typed.trim());
  const [kind, setKind] = useState<"" | PersonKind>("");
  const [inviting, setInviting] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const people = usePeople(q, kind, admin);
  const open = people.data?.find((x) => x.id === openId) ?? null;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title="People"
        subtitle="Accounts, invites and roles"
        actions={admin ? <IconButton icon="plus" label="Invite someone" variant="plain" onPress={() => setInviting(true)} /> : undefined}
      />
      {loaded && !admin ? (
        <ManageNotAllowed />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={people.isRefetching} onRefresh={() => void people.refetch()} tintColor={p.ink3} />}
        >
          <Field
            label="Search people"
            value={typed}
            onChangeText={setTyped}
            placeholder="Search by name or email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <FilterChips label="Filter" options={KINDS} value={kind} onChange={setKind} />
          <Card style={{ paddingVertical: 4 }}>
            <DownloadRow
              label="Download (Excel)"
              path={`/api/manage/people.csv${kind ? `?kind=${kind}` : ""}`}
              name={`people${kind ? `-${kind}` : ""}.csv`}
            />
          </Card>

          {people.isPending ? (
            <>
              <Skeleton height={84} />
              <Skeleton height={84} />
              <Skeleton height={84} />
            </>
          ) : people.isError && !people.data ? (
            <Failed message={errorDetail(people.error, "Check your connection, then try again.")} onRetry={() => people.refetch()} />
          ) : !people.data?.length ? (
            <Empty icon="search" title="No one matches." />
          ) : (
            <View style={{ gap: 8, opacity: people.isFetching && !people.isRefetching ? 0.6 : 1 }}>
              {people.data.map((x) => (
                <PersonCard key={x.id} person={x} onPress={() => setOpenId(x.id)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
      <InviteSheet visible={inviting} onClose={() => setInviting(false)} />
      {open && <PersonSheet person={open} onClose={() => setOpenId(null)} />}
    </KeyboardAvoidingView>
  );
}

function meta(x: ManagedPerson) {
  return `${x.email} · ${x.sections} ${x.sections === 1 ? "subject" : "subjects"} · ${
    x.last_login ? `last signed in ${relativeTime(x.last_login)}` : "never signed in"
  }`;
}

function PersonPills({ person: x }: { person: ManagedPerson }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Pill label={x.kind[0].toUpperCase() + x.kind.slice(1)} />
      {!x.is_active ? <Pill label="Deactivated" tone="danger" /> : x.invited ? <Pill label="Invited" tone="warn" /> : null}
      {x.roles.map((r) => (
        <Pill key={r.id} tone="accent" label={`${roleLabel[r.role] ?? r.role}${r.department ? ` · ${r.department}` : ""}`} />
      ))}
    </View>
  );
}

function PersonCard({ person: x, onPress }: { person: ManagedPerson; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={`${x.name}. Manage`} scaleTo={0.99} onPress={onPress}>
      <Card style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", opacity: x.is_active ? 1 : 0.7 }}>
        <Avatar text={x.initials} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <T variant="bodyStrong" tone={x.is_active ? "ink" : "ink3"} numberOfLines={1}>
            {x.name}
          </T>
          <PersonPills person={x} />
          <T variant="callout" tone="ink2">
            {meta(x)}
          </T>
        </View>
      </Card>
    </Press>
  );
}

/* ---------- Invite ---------- */

function InviteSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const action = useManageAction();
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [kind, setKind] = useState<PersonKind>("student");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setEmail("");
    setFirst("");
    setLast("");
    setKind("student");
    setError(null);
    onClose();
  }

  function submit() {
    if (!email.trim() || !first.trim()) return setError("Enter an email and a first name.");
    setError(null);
    action.mutate(
      {
        path: "/api/manage/people",
        init: { method: "POST", body: JSON.stringify({ email: email.trim(), first_name: first.trim(), last_name: last.trim(), kind }) },
      },
      { onSuccess: close, onError: (err) => setError(errorDetail(err, "Couldn't send the invite.")) },
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title="Invite someone">
      <KeyboardAvoidingView behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
          <T variant="callout" tone="ink2">
            They get an email with a link to set their password. Choosing “teacher” doesn’t give them any sections, subjects or roles; assign those separately.
          </T>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="name@university.edu"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          <ChoiceField
            label="They are a"
            value={kind}
            onChange={setKind}
            options={[
              { key: "student", label: "Student" },
              { key: "teacher", label: "Teacher" },
              { key: "staff", label: "Staff member" },
            ]}
          />
          <Field label="First name" value={first} onChangeText={setFirst} autoCapitalize="words" />
          <Field label="Last name" value={last} onChangeText={setLast} autoCapitalize="words" />
          <FormError text={error} />
          <Button label="Send invite" busy={action.isPending} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

/* ---------- One person ---------- */

type Mode = "idle" | "edit" | "role" | "reset";

function PersonSheet({ person: x, onClose }: { person: ManagedPerson; onClose: () => void }) {
  const p = useTheme();
  const { me } = useManageAccess();
  const action = useManageAction();
  const [mode, setMode] = useState<Mode>("idle");
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(path: string, init: RequestInit = { method: "POST" }, done?: string) {
    setError(null);
    setNotice(null);
    action.mutate(
      { path, init },
      {
        onSuccess: () => {
          setMode("idle");
          if (done) setNotice(done);
        },
        onError: (err) => setError(errorDetail(err, "That didn't work. Try again.")),
      },
    );
  }

  async function makeResetLink() {
    setError(null);
    setNotice(null);
    setResetting(true);
    try {
      const res = await apiFetch<{ link: string }>(`/api/manage/people/${x.id}/password-reset`, { method: "POST" });
      setResetLink(res.link);
      setMode("reset");
    } catch (err) {
      setError(errorDetail(err, "Couldn't make a reset link. Try again."));
    } finally {
      setResetting(false);
    }
  }

  function removeRole(r: ManagedPerson["roles"][number]) {
    const name = roleLabel[r.role] ?? r.role;
    Alert.alert(`Remove ${name} role from ${x.name}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => run(`/api/manage/roles/${r.id}`, { method: "DELETE" }) },
    ]);
  }

  function deactivate() {
    Alert.alert(`Deactivate ${x.name}?`, `${x.name} will be signed out and can't sign in until reactivated. Their work and messages stay.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Deactivate", style: "destructive", onPress: () => run(`/api/manage/people/${x.id}/deactivate`) },
    ]);
  }

  const busy = action.isPending || resetting;

  return (
    <Sheet visible onClose={onClose} title={x.name}>
      <KeyboardAvoidingView behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <PersonPills person={x} />
            <T variant="callout" tone="ink2">
              {meta(x)}
            </T>
          </View>

          {x.roles.length > 0 && (
            <View style={{ gap: 6 }}>
              <T variant="calloutStrong" tone="ink2">
                Roles
              </T>
              {x.roles.map((r) => (
                <View
                  key={r.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: p.accentSoft, borderRadius: radius.md, paddingLeft: 12, minHeight: 44 }}
                >
                  <T variant="calloutStrong" tone="accentInk" style={{ flex: 1 }}>
                    {roleLabel[r.role] ?? r.role}
                    {r.department ? ` · ${r.department}` : ""}
                  </T>
                  <IconButton
                    icon="close"
                    label={`Remove ${roleLabel[r.role] ?? r.role} role from ${x.name}`}
                    variant="plain"
                    size={40}
                    onPress={() => removeRole(r)}
                  />
                </View>
              ))}
            </View>
          )}

          {mode === "edit" ? (
            <EditPerson
              person={x}
              onDone={(msg) => {
                setMode("idle");
                if (msg) setNotice(msg);
              }}
            />
          ) : mode === "role" ? (
            <AddRole person={x} onDone={() => setMode("idle")} onError={setError} run={run} busy={action.isPending} />
          ) : mode === "reset" && resetLink ? (
            <View style={{ gap: 10, backgroundColor: p.fill, borderRadius: radius.md, padding: 12 }}>
              <T variant="callout">
                A reset link was emailed to {x.email}. If email isn’t set up yet, give them this link yourself. It works once and expires in a few days.
              </T>
              <T variant="caption" selectable style={{ fontWeight: "400" }}>
                {resetLink}
              </T>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Share link" style={{ flex: 1 }} onPress={() => Share.share({ message: resetLink }).catch(() => {})} />
                <Button label="Done" variant="secondary" style={{ flex: 1 }} onPress={() => setMode("idle")} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {x.invited && x.is_active && (
                <Button
                  label="Resend invite"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => run(`/api/manage/people/${x.id}/resend-invite`, undefined, "Invite sent again.")}
                />
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Edit" icon="pencil" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => setMode("edit")} />
                <Button label="Add role" icon="plus" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => setMode("role")} />
              </View>
              {!x.invited && x.is_active && (
                <Button label="Reset password" variant="secondary" busy={resetting} disabled={busy} onPress={makeResetLink} />
              )}
              {x.two_step && (
                <Button
                  label="Reset two-step"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    run(`/api/manage/people/${x.id}/reset-two-step`, undefined, "Two-step sign-in is off. They can set it up again from Profile.")
                  }
                />
              )}
              {x.id !== me?.id &&
                (x.is_active ? (
                  <Button label="Deactivate" variant="danger" disabled={busy} onPress={deactivate} />
                ) : (
                  <Button label="Reactivate" variant="secondary" disabled={busy} onPress={() => run(`/api/manage/people/${x.id}/reactivate`)} />
                ))}
            </View>
          )}

          <FormError text={error} />
          {notice ? (
            <T variant="callout" style={{ color: p.success }} accessibilityLiveRegion="polite">
              {notice}
            </T>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

function AddRole({
  person: x,
  onDone,
  onError,
  run,
  busy,
}: {
  person: ManagedPerson;
  onDone: () => void;
  onError: (msg: string | null) => void;
  run: (path: string, init?: RequestInit, done?: string) => void;
  busy: boolean;
}) {
  const p = useTheme();
  const departments = useDepartments();
  const [role, setRole] = useState("department_coordinator");
  const [dept, setDept] = useState<number | null>(null);

  return (
    <View style={{ gap: 14, backgroundColor: p.fill, borderRadius: radius.md, padding: 12 }}>
      <ChoiceField label="Role" value={role} onChange={setRole} options={ROLES} />
      {role === "department_coordinator" &&
        (departments.isPending ? (
          <Skeleton height={44} />
        ) : (
          <ChoiceField
            label="Department"
            value={dept}
            onChange={setDept}
            hint={dept === null ? "Choose a department" : undefined}
            options={(departments.data ?? []).map((d) => ({ key: d.id, label: d.name }))}
          />
        ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onDone} />
        <Button
          label="Grant"
          style={{ flex: 1 }}
          busy={busy}
          onPress={() => {
            onError(null);
            run(`/api/manage/people/${x.id}/roles`, {
              method: "POST",
              body: JSON.stringify({ role, department_id: role === "department_coordinator" ? dept : null }),
            });
          }}
        />
      </View>
    </View>
  );
}

/** Fix someone's details: names, email, student/teacher/staff and their college ID. */
function EditPerson({ person: x, onDone }: { person: ManagedPerson; onDone: (message?: string) => void }) {
  const p = useTheme();
  const action = useManageAction();
  const [first, setFirst] = useState(x.first_name);
  const [last, setLast] = useState(x.last_name);
  const [email, setEmail] = useState(x.email);
  const [kind, setKind] = useState<PersonKind>(x.kind);
  const [externalId, setExternalId] = useState(x.external_id);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!first.trim() || !email.trim()) return setError("Enter a first name and an email.");
    setError(null);
    action.mutate(
      {
        path: `/api/manage/people/${x.id}`,
        init: { method: "PATCH", body: JSON.stringify({ first_name: first, last_name: last, email, kind, external_id: externalId }) },
      },
      { onSuccess: () => onDone("Saved."), onError: (err) => setError(errorDetail(err, "Couldn't save. Try again.")) },
    );
  }

  return (
    <View style={{ gap: 14, backgroundColor: p.fill, borderRadius: radius.md, padding: 12 }}>
      <Field label="First name" value={first} onChangeText={setFirst} autoCapitalize="words" />
      <Field label="Last name" value={last} onChangeText={setLast} autoCapitalize="words" />
      <Field
        label="Email (they sign in with it)"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field label="College ID (roll number)" value={externalId} onChangeText={setExternalId} autoCapitalize="characters" autoCorrect={false} />
      <ChoiceField
        label="Type"
        value={kind}
        onChange={setKind}
        options={[
          { key: "student", label: "Student" },
          { key: "teacher", label: "Teacher" },
          { key: "staff", label: "Staff" },
        ]}
      />
      <FormError text={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => onDone()} />
        <Button label="Save" style={{ flex: 1 }} busy={action.isPending} onPress={save} />
      </View>
    </View>
  );
}
