import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, Alert, Modal, ScrollView, TextInput, ActivityIndicator, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, formatError } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

const inr = (n) => `₹ ${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const CATEGORIES = [
  { v: "travel_flight",    label: "Flight" },
  { v: "travel_hotel",     label: "Hotel" },
  { v: "travel_taxi",      label: "Taxi / Cab" },
  { v: "meals",            label: "Meals" },
  { v: "client_meeting",   label: "Client meeting" },
  { v: "office_supplies",  label: "Office supplies" },
  { v: "phone_internet",   label: "Phone / Internet" },
  { v: "fuel",             label: "Fuel" },
  { v: "training",         label: "Training" },
  { v: "medical",          label: "Medical" },
  { v: "subscription",     label: "Subscription" },
  { v: "other",            label: "Other" },
];

const STATUS_TINT = {
  draft:       { bg: "#fef3c7", fg: "#92400e" },
  submitted:   { bg: "#dbeafe", fg: "#1e40af" },
  approved:    { bg: "#d1fae5", fg: "#065f46" },
  rejected:    { bg: "#fee2e2", fg: "#991b1b" },
  reimbursed:  { bg: "#ede9fe", fg: "#5b21b6" },
};

export default function ExpensesScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get("/expenses");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { Alert.alert("Couldn't load", formatError(e)); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }) => {
    const tint = STATUS_TINT[item.status] || STATUS_TINT.draft;
    return (
      <View style={{ backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontWeight: "700", fontSize: 15, color: colors.fg }} numberOfLines={1}>{item.title || "Expense claim"}</Text>
            {item.purpose ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{item.purpose}</Text> : null}
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
              {(item.items || []).length} item{(item.items || []).length === 1 ? "" : "s"} · {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </View>
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.fg }}>{inr(item.total_amount)}</Text>
        </View>
        <View style={{ marginTop: spacing.sm, flexDirection: "row" }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: tint.bg }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: tint.fg, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.status}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: spacing.xxl * 2 }}>
            <Text style={[typography.h3]}>No expense claims yet</Text>
            <Text style={{ color: colors.muted, marginTop: 6, textAlign: "center" }}>Tap the green button to file your first claim.</Text>
          </View>
        }
      />
      <Pressable onPress={() => setShowNew(true)} style={({ pressed }) => ({
        position: "absolute", bottom: spacing.lg, left: spacing.lg, right: spacing.lg,
        backgroundColor: pressed ? "#047857" : colors.success, borderRadius: radii.md,
        paddingVertical: 14, alignItems: "center",
        shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      })}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>+ New expense claim</Text>
      </Pressable>
      <NewExpenseModal visible={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
    </View>
  );
}

function NewExpenseModal({ visible, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("travel_taxi");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState(null); // { file_name, content_type, base64_data, uri, uploaded_at }
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle(""); setPurpose(""); setCategory("travel_taxi"); setAmount(""); setDescription(""); setReceipt(null); setBusy(false);
  };

  const pickReceipt = async (fromCamera) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", `Please allow ${fromCamera ? "camera" : "photo library"} access in settings.`);
      return;
    }
    const r = fromCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setReceipt({
      file_name: a.fileName || `receipt-${Date.now()}.jpg`,
      content_type: a.mimeType || "image/jpeg",
      base64_data: a.base64,
      uri: a.uri,
      uploaded_at: new Date().toISOString(),
    });
  };

  const submit = async () => {
    if (!title.trim()) return Alert.alert("Title required", "Give your claim a short title.");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert("Amount required", "Enter a valid amount in INR.");
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        purpose: purpose.trim() || null,
        currency: "INR",
        items: [{
          category,
          expense_date: date,
          amount: amt,
          currency: "INR",
          description: description.trim() || null,
          receipts: receipt ? [{
            file_name: receipt.file_name,
            content_type: receipt.content_type,
            base64_data: receipt.base64_data,
            uploaded_at: receipt.uploaded_at,
          }] : [],
        }],
      };
      const created = await api.post("/expenses", body);
      // Auto-submit so it goes to the manager
      try { await api.post(`/expenses/${created.data.id}/submit`); } catch {}
      reset();
      onCreated?.();
    } catch (e) {
      Alert.alert("Submission failed", formatError(e));
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }}>
          <Text style={[typography.h2]}>New expense</Text>
          <Pressable onPress={() => { reset(); onClose(); }}><Text style={{ color: colors.muted, fontSize: 15 }}>Cancel</Text></Pressable>
        </View>

        <Field label="Title">
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Client visit Mumbai" style={inputStyle}/>
        </Field>

        <Field label="Purpose (optional)">
          <TextInput value={purpose} onChangeText={setPurpose} placeholder="Reason for the claim" style={inputStyle}/>
        </Field>

        <Field label="Category">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
            {CATEGORIES.map(c => (
              <Pressable key={c.v} onPress={() => setCategory(c.v)} style={{
                paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 4, borderRadius: 999,
                backgroundColor: category === c.v ? colors.fg : colors.card,
                borderWidth: 1, borderColor: category === c.v ? colors.fg : colors.border,
              }}>
                <Text style={{ color: category === c.v ? "#fff" : colors.fg, fontWeight: "600", fontSize: 13 }}>{c.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Field>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Amount (INR)">
              <TextInput value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" style={inputStyle}/>
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Date">
              <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={inputStyle}/>
            </Field>
          </View>
        </View>

        <Field label="Description (optional)">
          <TextInput value={description} onChangeText={setDescription} placeholder="Vendor, attendees, notes…" multiline style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}/>
        </Field>

        <Field label="Receipt">
          {receipt ? (
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              <Image source={{ uri: receipt.uri }} style={{ width: 64, height: 64, borderRadius: radii.sm, backgroundColor: colors.border }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", fontSize: 13, color: colors.fg }} numberOfLines={1}>{receipt.file_name}</Text>
                <Pressable onPress={() => setReceipt(null)}><Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>Remove</Text></Pressable>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <SmallBtn onPress={() => pickReceipt(true)} label="📷  Camera"/>
              <SmallBtn onPress={() => pickReceipt(false)} label="🖼  Gallery"/>
            </View>
          )}
        </Field>

        <Pressable onPress={submit} disabled={busy} style={({ pressed }) => ({
          backgroundColor: busy ? "#a1a1aa" : (pressed ? "#047857" : colors.success),
          paddingVertical: 14, borderRadius: radii.md, alignItems: "center", marginTop: spacing.xl,
        })}>
          {busy ? <ActivityIndicator color="#fff"/> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Submit claim</Text>}
        </Pressable>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: spacing.md, textAlign: "center" }}>
          Your manager will review and approve.
        </Text>
      </ScrollView>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[typography.tiny, { color: colors.muted, marginBottom: 6 }]}>{label}</Text>
      {children}
    </View>
  );
}

function SmallBtn({ onPress, label }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flex: 1, backgroundColor: pressed ? colors.border : colors.card,
      paddingVertical: 14, borderRadius: radii.md, alignItems: "center",
      borderWidth: 1, borderColor: colors.border,
    })}>
      <Text style={{ color: colors.fg, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const inputStyle = {
  backgroundColor: colors.card,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: radii.sm,
  paddingHorizontal: spacing.md,
  paddingVertical: 11,
  fontSize: 15,
  color: colors.fg,
};
