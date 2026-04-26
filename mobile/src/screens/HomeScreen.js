import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

function StatCard({ label, value, hint, tone = "default" }) {
  const accent = {
    default: { bg: colors.card, fg: colors.fg },
    success: { bg: "#d1fae5", fg: "#065f46" },
    warn:    { bg: "#fef3c7", fg: "#92400e" },
    info:    { bg: "#dbeafe", fg: "#1e40af" },
  }[tone];
  return (
    <View style={{ flex: 1, backgroundColor: accent.bg, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border }}>
      <Text style={[typography.tiny, { color: colors.muted }]}>{label}</Text>
      <Text style={{ fontSize: 26, fontWeight: "800", marginTop: spacing.xs, color: accent.fg }}>{value}</Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
    </View>
  );
}

function QuickAction({ icon, title, subtitle, onPress, accent }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flexBasis: "48%", flexGrow: 1, minHeight: 96,
      backgroundColor: pressed ? colors.border : colors.card,
      padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
      flexDirection: "row", gap: 10, alignItems: "flex-start",
    })}>
      <View style={{
        width: 36, height: 36, borderRadius: radii.sm, alignItems: "center", justifyContent: "center",
        backgroundColor: accent || "#f4f4f5",
      }}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: "700", fontSize: 14, color: colors.fg }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [stats, setStats] = useState({ leaves: 0, attendance_days: 0, pending_approvals: 0, unread: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const isManager = ["branch_manager", "sub_manager", "assistant_manager", "company_admin"].includes(user?.role);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const reqs = [
        api.get("/leave").catch(() => ({ data: [] })),
        api.get("/attendance").catch(() => ({ data: [] })),
        api.get("/notifications/unread_count").catch(() => ({ data: { count: 0 } })),
      ];
      if (isManager) reqs.push(api.get("/approvals?status=pending").catch(() => ({ data: [] })));
      const [lv, att, un, ap] = await Promise.all(reqs);
      const pendingLeaves = (lv.data || []).filter((l) => l.status === "pending").length;
      const monthPrefix = new Date().toISOString().slice(0, 7);
      const thisMonth = (att.data || []).filter((a) => (a.date || a.checkin_at || "").startsWith(monthPrefix)).length;
      const pendingApprovals = isManager ? (ap?.data || []).filter((r) => r.is_my_turn).length : 0;
      setStats({
        leaves: pendingLeaves,
        attendance_days: thisMonth,
        pending_approvals: pendingApprovals,
        unread: un.data?.count ?? un.data?.unread_count ?? 0,
      });
    } catch {} finally { setRefreshing(false); }
  }, [isManager]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      <View style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.tiny, { color: colors.muted }]}>{user?.role?.replace(/_/g, " ").toUpperCase()}</Text>
        <Text style={[typography.h2, { marginTop: 2 }]}>Hello, {user?.name?.split(" ")[0] || "there"}</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>Here's what's happening today.</Text>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }}>
        <StatCard label="Pending leaves" value={stats.leaves} tone={stats.leaves > 0 ? "warn" : "default"} />
        <StatCard label="Days marked" value={stats.attendance_days} hint="this month" tone="success" />
      </View>

      {isManager && stats.pending_approvals > 0 && (
        <Pressable onPress={() => navigation.navigate("Inbox")}
          style={({ pressed }) => ({
            backgroundColor: pressed ? "#1f1f23" : colors.fg,
            padding: spacing.lg, borderRadius: radii.md, marginBottom: spacing.md,
          })}>
          <Text style={[typography.tiny, { color: "#a1a1aa" }]}>APPROVALS QUEUE</Text>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 }}>{stats.pending_approvals}</Text>
          <Text style={{ color: "#a1a1aa", fontSize: 12 }}>Tap to review pending requests</Text>
        </Pressable>
      )}

      <Text style={[typography.h3, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Quick actions</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <QuickAction icon="🕐" title="Check in / out" subtitle="Mark attendance" onPress={() => navigation.navigate("Attendance")} accent="#dbeafe"/>
        <QuickAction icon="📅" title="Apply for leave" subtitle="Balances · time off"  onPress={() => navigation.navigate("Leave")} accent="#fef3c7"/>
        <QuickAction icon="💰" title="Payslips" subtitle="View & download" onPress={() => navigation.navigate("Payslips")} accent="#d1fae5"/>
        <QuickAction icon="🧾" title="File expense" subtitle="With receipt" onPress={() => navigation.navigate("Expenses")} accent="#ede9fe"/>
        <QuickAction icon="📚" title="Policies" subtitle="Read & acknowledge" onPress={() => navigation.navigate("WebView", { path: "/app/policies?embed=mobile", title: "Policies" })} accent="#ffedd5"/>
        <QuickAction icon="🎟️" title="Helpdesk" subtitle="Raise a ticket" onPress={() => navigation.navigate("WebView", { path: "/app/helpdesk?embed=mobile", title: "Helpdesk" })} accent="#fce7f3"/>
      </View>

      <View style={{ marginTop: spacing.xl, padding: spacing.lg, backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: stats.unread > 0 ? "#dbeafe" : "#f4f4f5", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 17 }}>🔔</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "700", color: colors.fg, fontSize: 14 }}>Inbox</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
            {stats.unread > 0 ? `${stats.unread} unread notification${stats.unread === 1 ? "" : "s"}` : "You're all caught up"}
          </Text>
        </View>
        <Pressable onPress={() => navigation.navigate("Inbox")} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm, backgroundColor: pressed ? colors.border : "transparent" })}>
          <Text style={{ color: colors.fg, fontWeight: "700", fontSize: 13 }}>Open ›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
