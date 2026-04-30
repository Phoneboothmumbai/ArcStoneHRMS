import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

/**
 * "More" hub — surfaces every employee feature that isn't on the main
 * bottom tab bar. Webview-backed screens live in `WebViewScreen` with a
 * specific path; native screens push directly.
 */
const SECTIONS = [
  {
    title: "Money",
    items: [
      { key: "Payslips",   label: "Payslips",         hint: "View & download payslips",    icon: "💰", native: true },
      { key: "Expenses",   label: "Expenses & Travel", hint: "File and track expense claims", icon: "🧾", native: true },
      { key: "Loans",      label: "Loans",            hint: "Request a salary advance",     icon: "🏦", native: true,
        entitlement: "expense" },
    ],
  },
  {
    title: "Performance",
    items: [
      { key: "WV.Goals",   label: "My Goals",     hint: "OKRs & key results", icon: "🎯",
        path: "/app/performance/goals?embed=mobile", entitlement: "performance" },
      { key: "WV.Reviews", label: "My Reviews",   hint: "Performance review cycles", icon: "📈",
        path: "/app/performance/reviews?embed=mobile", entitlement: "performance" },
    ],
  },
  {
    title: "Workplace",
    items: [
      { key: "WV.Policies",   label: "Policies",         hint: "Read & acknowledge HR policies",  icon: "📚",
        path: "/app/policies?embed=mobile" },
      { key: "WV.Helpdesk",   label: "Helpdesk",         hint: "Raise & track tickets",          icon: "🎟️",
        path: "/app/helpdesk?embed=mobile", entitlement: "helpdesk" },
      { key: "WV.PoSH",       label: "PoSH",             hint: "Anti-harassment complaints",     icon: "🛡️",
        path: "/app/posh?embed=mobile", entitlement: "helpdesk" },
      { key: "WV.Requests",   label: "Product / Service requests", hint: "Order from procurement", icon: "📦",
        path: "/app/requests?embed=mobile" },
      { key: "WV.Insurance",  label: "Insurance",        hint: "Group policies & file claims",   icon: "🩺" ,
        path: "/app/insurance?embed=mobile" },
      { key: "KnowledgeBase", label: "Knowledge base",   hint: "FAQs & articles",                icon: "📖", native: true },
      { key: "WV.Submissions", label: "My Submissions",  hint: "All your filed forms",          icon: "🗂️",
        path: "/app/my-submissions?embed=mobile" },
    ],
  },
  {
    title: "Account",
    items: [
      { key: "Profile",     label: "Profile & settings", hint: "Personal details, password",   icon: "👤", native: true },
      { key: "__signout",   label: "Sign out",          hint: "Log out of this device",        icon: "🚪", danger: true },
    ],
  },
];

export default function MoreScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [activeMods, setActiveMods] = useState(null);

  useEffect(() => {
    api.get("/modules/mine")
      .then(r => setActiveMods(r.data?.active_modules || []))
      .catch(() => setActiveMods([]));
  }, []);

  const isEntitled = (key) => {
    if (!key) return true;
    if (activeMods === null) return true; // optimistic until loaded
    return Array.isArray(activeMods) && activeMods.includes(key);
  };

  const handlePress = (it) => {
    if (it.key === "__signout") {
      Alert.alert("Sign out?", "You'll need to log in again to use the app.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: logout },
      ]);
      return;
    }
    if (it.entitlement && !isEntitled(it.entitlement)) {
      Alert.alert("Module not enabled", "Ask your HR admin to enable this module for your company.");
      return;
    }
    if (it.native) {
      navigation.navigate(it.key);
    } else if (it.path) {
      navigation.navigate("WebView", { path: it.path, title: it.label });
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <View style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h2]}>More</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
          {user?.name ? `Signed in as ${user.name}` : "Your full HR workspace"}
        </Text>
      </View>

      {SECTIONS.map((sec) => (
        <View key={sec.title} style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.tiny, { color: colors.muted, marginBottom: 8, paddingHorizontal: 4 }]}>{sec.title.toUpperCase()}</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            {sec.items.map((it, idx) => {
              const dim = it.entitlement && !isEntitled(it.entitlement);
              return (
                <Pressable key={it.key} onPress={() => handlePress(it)} style={({ pressed }) => ({
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  backgroundColor: pressed ? colors.bg : "transparent",
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                  opacity: dim ? 0.45 : 1,
                })}>
                  <Text style={{ fontSize: 22 }}>{it.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: it.danger ? colors.danger : colors.fg }}>{it.label}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                      {dim ? "Module not enabled" : it.hint}
                    </Text>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center", marginTop: spacing.lg }}>
        Arcstone HRMS · v1.0.1 · OTA-enabled
      </Text>
    </ScrollView>
  );
}
