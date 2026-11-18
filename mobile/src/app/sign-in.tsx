import { type ComponentRef, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Button, Field, T } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { font, radius, useTheme } from "@/theme";

type Step = "password" | "code" | "reset" | "resetSent";

export default function SignIn() {
  // Signed out, the theme is always the light one: paper on the deep field, as in the design.
  const site = useTheme();
  const paper = site;
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit() {
    setError(null);
    if (step === "password") {
      if (!email.trim() || !password) return setError("Enter your college email and password.");
      setBusy(true);
      const result = await auth.signIn(email, password);
      setBusy(false);
      if (!result.ok && "needsCode" in result) setStep("code");
      else if (!result.ok) setError(result.error);
    } else if (step === "code") {
      if (!code.trim()) return setError("Enter the code from your authenticator app.");
      setBusy(true);
      const failure = await auth.verifyCode(code);
      setBusy(false);
      if (failure) setError(failure);
    } else if (step === "reset") {
      if (!email.trim()) return setError("Enter your college email.");
      setBusy(true);
      const failure = await auth.requestReset(email);
      setBusy(false);
      if (failure) setError(failure);
      else setStep("resetSent");
    }
  }

  function go(next: Step) {
    setError(null);
    if (next === "password") auth.cancelCode();
    setStep(next);
  }

  const heading = {
    password: "Sign in",
    code: "Two-step sign-in",
    reset: "Reset your password",
    resetSent: "Check your email",
  }[step];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: site.field }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Animated.View entering={FadeIn.duration(400)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: site.accent, alignItems: "center", justifyContent: "center" }}>
            <Icon name="arch" size={24} strokeWidth={2} color={site.onAccent} />
          </View>
          <T variant="headline" tone="onField" style={{ fontSize: 20, fontFamily: font.bold }}>
            CampusVerse
          </T>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).springify().damping(22)}>
          <T
            accessibilityRole="header"
            tone="onField"
            style={{ marginTop: 56, fontFamily: font.display, fontSize: 44, lineHeight: 46, letterSpacing: -0.9 }}
          >
            Your college,{"\n"}on one screen.
          </T>
          <T variant="body" tone="onFieldMuted" style={{ marginTop: 16, fontSize: 16, lineHeight: 24 }}>
            Timetable, room changes, notices, coursework and section chat, with your college email.
          </T>
        </Animated.View>

        <View style={{ flex: 1, minHeight: 32 }} />

        <Animated.View
          entering={FadeInDown.delay(160).springify().damping(22)}
          style={{ backgroundColor: paper.bg, borderRadius: radius.xl, padding: 20, gap: 14 }}
        >
          {step !== "password" && (
            <T variant="headline" style={{ color: paper.ink }}>
              {heading}
            </T>
          )}

          {step === "password" && (
            <View style={{ gap: 14 }}>
                <Field
                  label="College email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@college.edu.pk"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="username"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <Field
                  ref={passwordRef}
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={submit}
                />
            </View>
          )}

          {step === "code" && (
            <>
              <T variant="callout" style={{ color: paper.ink2 }}>
                Enter the 6-digit code from your authenticator app, or one of your recovery codes.
              </T>
              <View style={{ gap: 14 }}>
                <Field
                  label="Code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  style={{ letterSpacing: 4, fontFamily: font.semibold }}
                />
              </View>
            </>
          )}

          {step === "reset" && (
            <>
              <T variant="callout" style={{ color: paper.ink2 }}>
                We’ll email you a link to choose a new password.
              </T>
              <View style={{ gap: 14 }}>
                <Field
                  label="College email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoFocus
                  returnKeyType="send"
                  onSubmitEditing={submit}
                />
              </View>
            </>
          )}

          {step === "resetSent" && (
            <T variant="callout" style={{ color: paper.ink2 }}>
              If {email.trim() || "that address"} has an account, a reset link is on its way. Open it on this phone or any
              computer, then come back and sign in.
            </T>
          )}

          {error ? (
            <View accessibilityLiveRegion="assertive" style={{ backgroundColor: paper.dangerSoft, borderRadius: radius.md, padding: 12 }}>
              <T variant="callout" style={{ color: paper.danger }}>
                {error}
              </T>
            </View>
          ) : null}

          {step !== "resetSent" ? (
            <Button
              label={{ password: "Sign in", code: "Verify", reset: "Send reset link", resetSent: "" }[step]}
              busy={busy}
              onPress={submit}
              style={{ minHeight: 52, backgroundColor: site.accent, borderColor: site.accent }}
            />
          ) : (
            <Button label="Back to sign in" onPress={() => go("password")} style={{ minHeight: 52 }} />
          )}

          {step === "password" ? (
            <View style={{ alignItems: "center", gap: 10 }}>
              <Pressable accessibilityRole="button" onPress={() => go("reset")} hitSlop={10}>
                <T variant="calloutStrong" style={{ color: paper.accentInk }}>
                  Forgot your password?
                </T>
              </Pressable>
              <T variant="callout" style={{ color: paper.ink3, textAlign: "center" }}>
                No account? Your college creates it and emails you an invite.
              </T>
            </View>
          ) : step !== "resetSent" ? (
            <Pressable accessibilityRole="button" onPress={() => go("password")} hitSlop={10} style={{ alignSelf: "center" }}>
              <T variant="calloutStrong" style={{ color: paper.accentInk }}>
                Back
              </T>
            </Pressable>
          ) : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
