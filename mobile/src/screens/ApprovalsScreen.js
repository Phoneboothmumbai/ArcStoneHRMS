import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Alert, RefreshControl } from "react-native";
import { api, formatError } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

export default function ApprovalsScreen() {
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get("/approvals?status=pending");
      setRows((data || []).filter((r) => r.is_my_turn));
    } catch (e) { Alert.alert("Error", formatError(e)); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id, decision) => {
    try {
      await api.post(`/approvals/${id}/decide`, { decision, comment: "" });
      load();
    } catch (e) { Alert.alert("Failed", formatError(e)); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load}/>}
    >
      <Text style={typography.h2}>Pending approvals</Text>
      <Text style={{ color: colors.muted, marginTop: 2 }}>{rows.length} awaiting your decision</Text>

      {rows.length === 0 && (
        <View style={{ padding: spacing.xxl, alignItems: "center" }}>
          <Text style={{ color: colors.muted }}>Nothing pending — you're all caught up.</Text>
        </View>
      )}

      {rows.map((r) => (
        <View key={r.id} style={{ backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md }}>
          <Text style={[typography.tiny, { color: colors.muted }]}>{r.request_type?.toUpperCase()} · STEP {r.current_step}/{r.steps?.length}</Text>
          <Text style={{ fontWeight: "700", marginTop: 4 }}>{r.requester_name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
            {r.details?.leave_type || r.details?.category}
            {r.details?.start ? ` · ${r.details.start} → ${r.details.end}` : ""}
            {r.details?.title ? ` · ${r.details.title}` : ""}
          </Text>
          {r.details?.reason ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>{r.details.reason}</Text> : null}

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <Pressable onPress={() => decide(r.id, "approve")}
              style={{ flex: 1, backgroundColor: colors.success, padding: spacing.md, borderRadius: radii.md, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Approve</Text>
            </Pressable>
            <Pressable onPress={() => decide(r.id, "reject")}
              style={{ flex: 1, backgroundColor: colors.danger, padding: spacing.md, borderRadius: radii.md, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Reject</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
