import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Chip, Field, Pill, Skeleton, T } from "@/components/ui";
import {
  accountError,
  activateTotp,
  changePassword,
  confirmPassword,
  NeedsPassword,
  recoveryCodes,
  TOPICS,
  type CorrectionTopic,
  totpSetup,
  type TotpSetup,
  turnOffTotp,
  useAskCorrection,
  useCorrections,
} from "@/lib/account";
import { relativeTime } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";

/** Your password, two-step sign-in, and asking the college to correct your details. */
export default function Security() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  // Asking for the password before a sensitive step: resolves true once confirmed, false if not.
  const [asking, setAsking] = useState<null | ((ok: boolean) => void)>(null);
  const askPassword = () => new Promise<boolean>((resolve) => setAsking(() => resolve));
  const answer = (ok: boolean) => {
    asking?.(ok);
    setAsking(null);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Account and security" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: insets.bottom + 40 }}>
        <Group title="Password">
          <PasswordCard />
        </Group>
        <Group title="Two-step sign-in">
          <TwoStepCard askPassword={askPassword} />
        </Group>
        <Group title="Something wrong in your details?">
          <CorrectionsCard />
        </Group>
      </ScrollView>
      <ConfirmPassword visible={asking !== null} onCancel={() => answer(false)} onConfirmed={() => answer(true)} />
    </KeyboardAvoidingView>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="caption" tone="ink3" accessibilityRole="header" style={{ textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 4 }}>
        {title}
      </T>
      {children}
    </View>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  async function save() {
    setError(null);
    if (!current || !next) return setError("Fill in your current and new password.");
    if (next !== again) return setError("The new passwords don't match.");
    setState("busy");
    const failure = await changePassword(current, next);
    if (failure) {
      setError(failure);
      setState("idle");
    } else {
      setCurrent("");
      setNext("");
      setAgain("");
      setState("done");
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" textContentType="password" />
      <Field label="New password" value={next} onChangeText={(v) => { setNext(v); setState("idle"); }} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={error} />
      {state === "done" ? <Pill label="Password changed" tone="success" icon="check" /> : null}
      <Button label="Change password" busy={state === "busy"} onPress={save} />
    </Card>
  );
}

function TwoStepCard({ askPassword }: { askPassword: () => Promise<boolean> }) {
  const p = useTheme();
  const qc = useQueryClient();
  const me = useMe().data;
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  // The code as typed now: a retry after the password check must not reuse an expired one.
  const codeNow = useRef("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = !!me?.two_step;

  /** Runs a sensitive step; if allauth asks for the password first, asks, then runs it again. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      try {
        await action();
      } catch (err) {
        if (!(err instanceof NeedsPassword)) throw err;
        if (await askPassword()) await action();
      }
    } catch (err) {
      setError(accountError(err, "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ["me"] });

  if (!me) return <Skeleton height={120} />;

  if (codes) {
    return (
      <Card style={{ gap: 10 }}>
        <T variant="headline">Your recovery codes</T>
        <T variant="callout" tone="ink2">
          Keep these somewhere safe, like a password manager. Each one signs you in once if you lose your phone. They won&rsquo;t be shown again.
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {codes.map((c) => (
            <T key={c} selectable style={{ fontFamily: font.semibold, fontSize: 15, letterSpacing: 1, backgroundColor: p.fill, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: p.ink }}>
              {c}
            </T>
          ))}
        </View>
        <Button label="I've saved them" onPress={() => setCodes(null)} />
      </Card>
    );
  }

  if (setup) {
    const secret = setup.secret.match(/.{1,4}/g)?.join(" ") ?? setup.secret;
    return (
      <Card style={{ gap: 12 }}>
        <T variant="headline">Set up your authenticator app</T>
        <T variant="callout" tone="ink2">
          1. Add CampusVerse to an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).
        </T>
        <Button label="Open in authenticator app" icon="online" variant="secondary" onPress={() => Linking.openURL(setup.totp_url).catch(() => setError("No authenticator app here. Type the key below into it instead."))} />
        <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
          Or type this key into the app:
        </T>
        <T selectable style={{ fontFamily: font.semibold, fontSize: 16, letterSpacing: 1.5, color: p.ink, backgroundColor: p.fill, borderRadius: radius.md, padding: 12, textAlign: "center" }}>
          {secret}
        </T>
        <Field
          label="2. Enter the 6-digit code it shows"
          value={code}
          onChangeText={(v) => {
            codeNow.current = v;
            setCode(v);
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={7}
          error={error}
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setSetup(null)} />
          <Button
            label="Turn on"
            style={{ flex: 1 }}
            busy={busy}
            onPress={() =>
              run(async () => {
                const list = await activateTotp(codeNow.current);
                setSetup(null);
                setCode("");
                codeNow.current = "";
                setCodes(list);
                await refresh();
              })
            }
          />
        </View>
      </Card>
    );
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <T variant="bodyStrong" style={{ flex: 1 }}>
          {on ? "On: signing in asks for a code from your authenticator app." : "Off: signing in needs only your password."}
        </T>
        {on ? <Pill label="On" tone="success" icon="check" /> : null}
      </View>
      {error ? (
        <T variant="callout" tone="danger">
          {error}
        </T>
      ) : null}
      {on ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="New recovery codes" variant="secondary" style={{ flex: 1 }} busy={busy} onPress={() => run(async () => setCodes(await recoveryCodes(true)))} />
          <Button label="Turn off" variant="danger" style={{ flex: 1 }} onPress={() => run(async () => { await turnOffTotp(); await refresh(); })} />
        </View>
      ) : (
        <Button
          label="Set up two-step sign-in"
          busy={busy}
          onPress={() =>
            run(async () => {
              const pending = await totpSetup();
              if (pending) setSetup(pending);
              else await refresh();
            })
          }
        />
      )}
    </Card>
  );
}

function CorrectionsCard() {
  const p = useTheme();
  const list = useCorrections();
  const ask = useAskCorrection();
  const [topic, setTopic] = useState<CorrectionTopic | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  function send() {
    setError(null);
    if (!topic) return setError("Choose what's wrong.");
    if (details.trim().length < 5) return setError("Say what should change.");
    ask.mutate(
      { topic, details: details.trim() },
      {
        onSuccess: () => {
          setTopic(null);
          setDetails("");
        },
        onError: (err) => setError(accountError(err, "Couldn't send it. Try again.")),
      },
    );
  }

  return (
    <Card style={{ gap: 12 }}>
      <T variant="callout" tone="ink2">
        Your name, email and courses come from the college. Ask them to fix anything that&rsquo;s wrong.
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {TOPICS.map((t) => (
          <Chip key={t.key} label={t.label} on={topic === t.key} onPress={() => setTopic(t.key)} />
        ))}
      </View>
      <Field label="What should it say?" value={details} onChangeText={setDetails} multiline maxLength={1000} style={{ minHeight: 80, paddingTop: 12, textAlignVertical: "top" }} error={error} />
      <Button label="Send request" busy={ask.isPending} onPress={send} />
      {list.data?.length ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          <T variant="calloutStrong" tone="ink2">
            Your requests
          </T>
          {list.data.map((c) => (
            <View key={c.id} style={{ backgroundColor: p.fill, borderRadius: radius.md, padding: 12, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <T variant="calloutStrong">{c.topic_label}</T>
                <Pill label={c.status === "open" ? "Waiting" : c.status === "resolved" ? "Fixed" : "Declined"} tone={c.status === "open" ? "neutral" : c.status === "resolved" ? "success" : "danger"} />
              </View>
              <T variant="callout" tone="ink2">
                {c.details}
              </T>
              {c.response ? (
                <T variant="callout" tone="accentInk">
                  {c.response}
                </T>
              ) : null}
              <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
                {relativeTime(c.created_at)}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ConfirmPassword({ visible, onCancel, onConfirmed }: { visible: boolean; onCancel: () => void; onConfirmed: () => void }) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    const failure = await confirmPassword(password);
    setBusy(false);
    if (failure) return setError(failure);
    setPassword("");
    onConfirmed();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable accessibilityLabel="Close" onPress={onCancel} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
      <KeyboardAvoidingView behavior="padding">
        <View style={{ backgroundColor: p.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
          <T variant="headline">Confirm it&rsquo;s you</T>
          <T variant="callout" tone="ink2">
            Enter your password to change your sign-in settings.
          </T>
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoFocus autoComplete="current-password" error={error} onSubmitEditing={confirm} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onCancel} />
            <Button label="Confirm" style={{ flex: 1 }} busy={busy} onPress={confirm} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
