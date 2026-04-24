import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

function Card({ label, value, hint }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border }}>
      <Text style={[typography.tiny, { color: colors.muted }]}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: "800", marginTop: spacing.xs }}>{value}</Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ leaves: 0, attendance_days: 0, pending_approvals: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const [lv, att] = await Promise.all([
        api.get("/leave"),
        api.get("/attendance"),
      ]);
      const pending = lv.data.filter((l) => l.status === "pending").length;
      const today = new Date().toISOString().slice(0, 7);
      const thisMonth = (att.data || []).filter((a) => a.date?.startsWith(today)).length;

      let pendingApprovals = 0;
      if (["branch_manager", "sub_manager", "assistant_manager", "company_admin"].includes(user?.role)) {
        try {
          const ap = await api.get("/approvals?status=pending");
          pendingApprovals = (ap.data || []).filter((r) => r.is_my_turn).length;
        } catch {}
      }
      setStats({ leaves: pending, attendance_days: thisMonth, pending_approvals: pendingApprovals });
    } catch {} finally { setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const isManager = ["branch_manager", "sub_manager", "assistant_manager", "company_admin"].includes(user?.role);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load}/>}
    >
      <View style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.tiny, { color: colors.muted }]}>{user?.role?.replace(/_/g, " ").toUpperCase()}</Text>
        <Text style={[typography.h2, { marginTop: 2 }]}>Hello, {user?.name?.split(" ")[0]}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }}>
        <Card label="Pending leaves" value={stats.leaves} />
        <Card label="Days marked" value={stats.attendance_days} hint="this month" />
      </View>

      {isManager && (
        <Pressable onPress={() => navigation.navigate("Approvals")}
          style={{ backgroundColor: colors.fg, padding: spacing.lg, borderRadius: radii.md, marginBottom: spacing.md }}>
          <Text style={[typography.tiny, { color: "#a1a1aa" }]}>APPROVALS QUEUE</Text>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 }}>
            {stats.pending_approvals}
          </Text>
          <Text style={{ color: "#a1a1aa", fontSize: 12 }}>Tap to review pending requests</Text>
        </Pressable>
      )}

      <Text style={[typography.h3, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Quick actions</Text>
      <View style={{ gap: spacing.sm }}>
        <QuickAction onPress={() => navigation.navigate("Attendance")} title="Check in / out" subtitle="Mark today's attendance"/>
        <QuickAction onPress={() => navigation.navigate("Leave")} title="Apply for leave" subtitle="View balances · request time off"/>
        <QuickAction onPress={() => navigation.navigate("Profile")} title="My profile" subtitle="View and update your info"/>
      </View>

      <Pressable onPress={logout} style={{ marginTop: spacing.xxl, alignItems: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function QuickAction({ title, subtitle, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      backgroundColor: pressed ? colors.border : colors.card,
      padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    })}>
      <Text style={{ fontWeight: "700", fontSize: 15 }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
    </Pressable>
  );
}
