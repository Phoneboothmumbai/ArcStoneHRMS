import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

const LOAN_TYPES = [
  { v: "salary_advance", label: "Salary advance" },
  { v: "personal",       label: "Personal" },
  { v: "medical",        label: "Medical emergency" },
  { v: "housing",        label: "Housing" },
  { v: "other",          label: "Other" },
];

const STATUS_TONE = {
  pending:   { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
  approved:  { bg: "#d1fae5", fg: "#065f46", label: "Approved" },
  rejected:  { bg: "#fee2e2", fg: "#991b1b", label: "Rejected" },
  withdrawn: { bg: "#e4e4e7", fg: "#52525b", label: "Withdrawn" },
};

const fmtInr = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function LoansScreen() {
  const [loans, setLoans] = useState([]);           // active disbursed loans
  const [requests, setRequests] = useState([]);     // loan requests (pending/approved/rejected)
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [reqRes, loanRes] = await Promise.all([
        api.get("/loan-requests"),
        // Active disbursed loans — `/api/loans` enforces tenant isolation and
        // auto-scopes to the current employee for non-admin roles.
        api.get("/loans").catch(() => ({ data: [] })),
      ]);
      setRequests(Array.isArray(reqRes.data) ? reqRes.data : []);
      setLoans(Array.isArray(loanRes.data) ? loanRes.data : []);
    } catch (e) {
      Alert.alert("Couldn't load loans", formatError(e));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const totalOutstanding = loans.reduce((s, l) => s + (l.outstanding || 0), 0);
  const emiTotal = loans.reduce((s, l) => s + (l.emi_monthly || 0), 0);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}
      >
        <Text style={typography.h2}>My loans</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: spacing.lg }}>
          Track salary advances, EMIs, and active requests.
        </Text>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: "#fef3c7" }]}>
            <Text style={styles.summaryLabel}>Outstanding</Text>
            <Text style={[styles.summaryValue, { color: "#92400e" }]}>{fmtInr(totalOutstanding)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: "#e0e7ff" }]}>
            <Text style={styles.summaryLabel}>Monthly EMI</Text>
            <Text style={[styles.summaryValue, { color: "#3730a3" }]}>{fmtInr(emiTotal)}</Text>
          </View>
        </View>

        {/* Active loans */}
        {loans.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active loans</Text>
            {loans.map(l => (
              <View key={l.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{l.loan_type?.replace(/_/g, " ") || "Loan"}</Text>
                  <Text style={styles.rowSub}>
                    {fmtInr(l.principal)} · {l.tenure_months}mo · EMI {fmtInr(l.emi_monthly)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowAmount}>{fmtInr(l.outstanding)}</Text>
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>outstanding</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Request history */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>
              Requests {pendingCount > 0 && <Text style={{ color: colors.muted, fontSize: 11 }}> · {pendingCount} pending</Text>}
            </Text>
          </View>
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="document-outline" size={28} color={colors.muted}/>
              <Text style={{ color: colors.muted, marginTop: 8, fontSize: 13 }}>No requests yet.</Text>
            </View>
          ) : requests.map(r => {
            const tone = STATUS_TONE[r.status] || STATUS_TONE.pending;
            return (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {fmtInr(r.amount)} · {r.loan_type?.replace(/_/g, " ")}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {r.tenure_months}mo · {fmtDate(r.created_at)}
                  </Text>
                  {r.purpose ? <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }} numberOfLines={2}>“{r.purpose}”</Text> : null}
                  {r.decision_note ? <Text style={{ fontSize: 11, color: "#475569", marginTop: 4, fontStyle: "italic" }}>HR: {r.decision_note}</Text> : null}
                </View>
                <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setModalOpen(true)}>
        <Ionicons name="add" size={22} color="#fff"/>
        <Text style={styles.fabText}>New request</Text>
      </Pressable>

      <NewLoanModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => { setModalOpen(false); load(); }}
      />
    </View>
  );
}

function NewLoanModal({ visible, onClose, onCreated }) {
  const [loanType, setLoanType] = useState("salary_advance");
  const [amount, setAmount] = useState("");
  const [tenure, setTenure] = useState("6");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setAmount(""); setTenure("6"); setPurpose(""); setLoanType("salary_advance"); };

  const submit = async () => {
    const amt = parseFloat(amount);
    const mo = parseInt(tenure, 10);
    if (!amt || amt <= 0) return Alert.alert("Invalid amount", "Please enter an amount greater than zero.");
    if (!mo || mo < 1 || mo > 120) return Alert.alert("Invalid tenure", "Tenure must be between 1 and 120 months.");
    if (!purpose || purpose.trim().length < 3) return Alert.alert("Missing reason", "Please tell HR what this loan is for.");
    setSubmitting(true);
    try {
      await api.post("/loan-requests", { loan_type: loanType, amount: amt, tenure_months: mo, purpose: purpose.trim() });
      reset();
      onCreated?.();
      Alert.alert("Request submitted", "HR will review your request and respond via notification.");
    } catch (e) {
      Alert.alert("Couldn't submit", formatError(e));
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.fg }}>New loan request</Text>
            <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={22} color={colors.fg}/></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Loan type</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
              {LOAN_TYPES.map(t => (
                <Pressable key={t.v} onPress={() => setLoanType(t.v)} style={[styles.chip, loanType === t.v && styles.chipActive]}>
                  <Text style={[styles.chipText, loanType === t.v && styles.chipTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <TextInput
              value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="e.g. 50000"
              placeholderTextColor={colors.muted} style={styles.input}
            />

            <Text style={styles.fieldLabel}>Tenure (months)</Text>
            <TextInput
              value={tenure} onChangeText={setTenure} keyboardType="number-pad" placeholder="6"
              placeholderTextColor={colors.muted} style={styles.input}
            />
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: -spacing.sm, marginBottom: spacing.md }}>
              EMI of roughly {amount && tenure ? fmtInr(parseFloat(amount) / Math.max(1, parseInt(tenure, 10))) : "—"}/month
            </Text>

            <Text style={styles.fieldLabel}>Reason / purpose</Text>
            <TextInput
              value={purpose} onChangeText={setPurpose} multiline numberOfLines={4}
              placeholder="Briefly explain what this is for (min. 3 chars)…"
              placeholderTextColor={colors.muted}
              style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            />

            <Pressable onPress={submit} disabled={submitting}
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}>
              {submitting ? <ActivityIndicator color="#fff"/> :
                <Text style={styles.submitText}>Submit request</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, padding: spacing.md, borderRadius: radii.md },
  summaryLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#64748b", marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: "800" },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.fg, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "flex-start", padding: spacing.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, marginBottom: 8 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.fg, textTransform: "capitalize" },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: "800", color: colors.fg },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginLeft: 8 },
  pillText: { fontSize: 11, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: spacing.xl, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, borderStyle: "dashed" },
  fab: { position: "absolute", bottom: 24, right: 20, flexDirection: "row", alignItems: "center", backgroundColor: colors.fg, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 28, gap: 6, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 11, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, fontSize: 15, color: colors.fg, marginBottom: spacing.md },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipActive: { backgroundColor: colors.fg, borderColor: colors.fg },
  chipText: { fontSize: 12, color: colors.fg, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  submitBtn: { backgroundColor: colors.accent, padding: spacing.md, borderRadius: radii.md, alignItems: "center", marginTop: spacing.md },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
