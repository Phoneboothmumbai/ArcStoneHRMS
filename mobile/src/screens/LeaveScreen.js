import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { api, formatError } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

export default function LeaveScreen() {
  const [balances, setBalances] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [types, setTypes] = useState([]);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const me = await api.get("/auth/me");
      const [bal, lv, ty] = await Promise.all([
        api.get(`/leave-balances/employee/${me.data.employee_id}`),
        api.get("/leave"),
        api.get("/leave-types"),
      ]);
      setBalances(bal.data.balances || []);
      setLeaves(lv.data || []);
      setTypes(ty.data || []);
    } catch (e) { Alert.alert("Error", formatError(e)); }
    finally { setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load}/>}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
          <Text style={typography.h3}>My balances</Text>
          <Pressable onPress={() => setOpen(true)}
            style={{ backgroundColor: colors.accent, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.pill }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>+ Apply</Text>
          </Pressable>
        </View>

        <View style={{ gap: spacing.xs, marginBottom: spacing.xl }}>
          {balances.filter((b) => (b.entitled ?? b.allotted ?? 0) > 0).map((b) => (
            <View key={b.leave_type_id || b.leave_type_code} style={{ backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontWeight: "600" }}>{b.leave_type_name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>used {b.used} · pending {b.pending}</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: "700" }}>{b.available ?? 0}</Text>
            </View>
          ))}
        </View>

        <Text style={typography.h3}>History</Text>
        {leaves.slice(0, 15).map((l) => (
          <View key={l.id} style={{ backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "600" }}>{l.leave_type_name || l.leave_type}</Text>
              <StatusBadge status={l.status}/>
            </View>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{l.start_date} → {l.end_date} · {l.days}d</Text>
            {l.reason ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{l.reason}</Text> : null}
          </View>
        ))}
      </ScrollView>

      <ApplyLeaveModal open={open} onClose={() => setOpen(false)} types={types} onDone={() => { setOpen(false); load(); }}/>
    </>
  );
}

function StatusBadge({ status }) {
  const map = {
    approved: { bg: "#dcfce7", fg: "#166534" },
    pending: { bg: "#fef3c7", fg: "#92400e" },
    rejected: { bg: "#fee2e2", fg: "#991b1b" },
    cancelled: { bg: "#e5e7eb", fg: "#374151" },
  };
  const m = map[status] || { bg: "#e5e7eb", fg: "#374151" };
  return (
    <Text style={{ backgroundColor: m.bg, color: m.fg, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
      {status}
    </Text>
  );
}

function ApplyLeaveModal({ open, onClose, types, onDone }) {
  const [typeId, setTypeId] = useState(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!typeId || !start || !end) return Alert.alert("Missing", "Pick type and dates.");
    setBusy(true);
    try {
      await api.post("/leave", {
        leave_type_id: typeId, start_date: start, end_date: end, reason,
      });
      Alert.alert("Submitted", "Your leave has been sent for approval.");
      onDone();
    } catch (e) { Alert.alert("Failed", formatError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl }}>
        <Text style={typography.h2}>Apply for leave</Text>

        <Text style={[typography.tiny, { color: colors.muted, marginTop: spacing.lg }]}>Type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}>
          {types.map((t) => (
            <Pressable key={t.id} onPress={() => setTypeId(t.id)}
              style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: radii.pill,
                backgroundColor: typeId === t.id ? colors.accent : colors.card, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: typeId === t.id ? "#fff" : colors.fg, fontSize: 13 }}>{t.code} · {t.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[typography.tiny, { color: colors.muted, marginTop: spacing.lg }]}>Start date (YYYY-MM-DD)</Text>
        <TextInput value={start} onChangeText={setStart} placeholder="2026-03-05" placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, marginTop: spacing.xs }}/>

        <Text style={[typography.tiny, { color: colors.muted, marginTop: spacing.md }]}>End date (YYYY-MM-DD)</Text>
        <TextInput value={end} onChangeText={setEnd} placeholder="2026-03-05" placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, marginTop: spacing.xs }}/>

        <Text style={[typography.tiny, { color: colors.muted, marginTop: spacing.md }]}>Reason</Text>
        <TextInput value={reason} onChangeText={setReason} multiline placeholder="Personal work…" placeholderTextColor={colors.muted}
          style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, marginTop: spacing.xs, minHeight: 80, textAlignVertical: "top" }}/>

        <Pressable onPress={submit} disabled={busy}
          style={({ pressed }) => ({ backgroundColor: colors.accent, padding: spacing.md, borderRadius: radii.md, marginTop: spacing.xl, alignItems: "center", opacity: pressed || busy ? 0.7 : 1 })}>
          {busy ? <ActivityIndicator color="#fff"/> : <Text style={{ color: "#fff", fontWeight: "700" }}>Submit</Text>}
        </Pressable>
        <Pressable onPress={onClose} style={{ marginTop: spacing.md, alignItems: "center" }}>
          <Text style={{ color: colors.muted }}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}
