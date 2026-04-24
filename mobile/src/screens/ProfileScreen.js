import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, radii, typography } from "../lib/theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user?.employee_id) return;
    setRefreshing(true);
    try {
      const { data } = await api.get(`/profile/employee/${user.employee_id}`);
      setProfile(data);
    } catch {} finally { setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  if (!profile) return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ color: colors.muted }}>Loading…</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load}/>}
    >
      <View style={{ alignItems: "center", marginBottom: spacing.xl }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.fg, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "800" }}>
            {(user.name || "U").split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </Text>
        </View>
        <Text style={[typography.h2, { marginTop: spacing.md }]}>{user.name}</Text>
        <Text style={{ color: colors.muted }}>{user.email}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{user.role.replace(/_/g, " ")}</Text>
      </View>

      <Section title="Completeness" value={`${profile.completeness_pct || 0}%`}/>
      <Section title="Employee code" value={profile.employee_code || "—"}/>
      <Section title="Department" value={profile.department_name || profile.department || "—"}/>
      <Section title="Branch" value={profile.branch_name || profile.branch || "—"}/>
      <Section title="Manager" value={profile.manager_name || "—"}/>
      <Section title="Joining date" value={profile.date_of_joining || "—"}/>
      <Section title="Employment type" value={profile.employment_type || "—"}/>

      <Pressable onPress={logout} style={{ marginTop: spacing.xxl, padding: spacing.md, alignItems: "center" }}>
        <Text style={{ color: colors.danger, fontWeight: "600" }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, value }) {
  return (
    <View style={{ backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs, flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{title}</Text>
      <Text style={{ fontWeight: "600", fontSize: 14 }}>{value}</Text>
    </View>
  );
}
