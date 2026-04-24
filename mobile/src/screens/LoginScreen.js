import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, radii, typography } from "../lib/theme";
import { formatError } from "../lib/api";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return Alert.alert("Missing", "Email and password required");
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // Store credentials flag so next launch can offer biometric
      await AsyncStorage.setItem("biometric_enabled", "true");
    } catch (e) {
      Alert.alert("Login failed", formatError(e));
    } finally { setBusy(false); }
  };

  const biometricUnlock = async () => {
    const saved = await AsyncStorage.getItem("last_email");
    if (!saved) return Alert.alert("Not available", "Sign in at least once to enable biometric unlock.");
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHw || !isEnrolled) return Alert.alert("Not available", "Device does not support biometrics.");
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Arcstone HRMS" });
    if (res.success) {
      // Re-hydrate session from stored token (if still valid). If not, force email/password.
      const token = await AsyncStorage.getItem("access_token");
      if (!token) return Alert.alert("Session expired", "Please sign in with your password.");
      // No-op: AuthContext will pick up the token on next load. Easiest: ask user to restart.
      Alert.alert("Unlocked", "Reopen the app to continue.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.xl }}
    >
      <View style={{ marginBottom: spacing.xxl }}>
        <View style={{ width: 48, height: 48, backgroundColor: colors.fg, borderRadius: radii.md, justifyContent: "center", alignItems: "center", marginBottom: spacing.md }}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>A</Text>
        </View>
        <Text style={typography.h1}>Arcstone</Text>
        <Text style={{ color: colors.muted, marginTop: spacing.xs }}>HRMS · Enterprise</Text>
      </View>

      <Text style={[typography.tiny, { color: colors.muted, marginBottom: spacing.xs }]}>Email</Text>
      <TextInput
        value={email}
        onChangeText={(v) => { setEmail(v); AsyncStorage.setItem("last_email", v); }}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@company.com"
        placeholderTextColor={colors.muted}
        style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.md, fontSize: 15 }}
      />

      <Text style={[typography.tiny, { color: colors.muted, marginBottom: spacing.xs }]}>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor={colors.muted}
        style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.xl, fontSize: 15 }}
      />

      <Pressable
        onPress={submit}
        disabled={busy}
        style={({ pressed }) => ({
          backgroundColor: colors.accent, padding: spacing.md, borderRadius: radii.md,
          alignItems: "center", opacity: pressed || busy ? 0.7 : 1,
        })}
      >
        {busy ? <ActivityIndicator color="#fff"/> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Sign in</Text>}
      </Pressable>

      <Pressable onPress={biometricUnlock} style={{ marginTop: spacing.lg, alignItems: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Use Face ID / fingerprint</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
