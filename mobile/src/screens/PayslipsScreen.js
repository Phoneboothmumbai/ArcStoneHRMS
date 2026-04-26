import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, ActivityIndicator, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, formatError } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

const BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "https://people-partner-cloud.preview.emergentagent.com";

const inr = (n) => `₹ ${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function PayslipsScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get("/payslips");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      Alert.alert("Couldn't load payslips", formatError(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const downloadPdf = async (slip) => {
    setBusy(slip.id);
    try {
      const token = await AsyncStorage.getItem("access_token");
      const url = `${BASE_URL}/api/payslips/${slip.id}/pdf`;
      const dest = `${FileSystem.cacheDirectory}payslip-${slip.id}.pdf`;
      const dl = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, { mimeType: "application/pdf", dialogTitle: "Payslip" });
      } else {
        await Print.printAsync({ uri: dl.uri });
      }
    } catch (e) {
      Alert.alert("Download failed", e.message || "Could not download payslip.");
    } finally {
      setBusy(null);
    }
  };

  const renderItem = ({ item }) => {
    const period = formatPeriod(item.period_month);
    const net = item.net ?? item.net_pay ?? 0;
    const status = (item.status || "").toLowerCase();
    return (
      <View style={{ backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.tiny, { color: colors.muted }]}>{(status || "draft").toUpperCase()}</Text>
            <Text style={{ fontSize: 17, fontWeight: "700", marginTop: 4, color: colors.fg }}>{period}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
              {item.payable_days != null ? `${item.payable_days} payable days` : ""}
              {item.lop_days ? `   ·   ${item.lop_days} LOP` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>NET PAY</Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.success }}>{inr(net)}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => downloadPdf(item)}
          disabled={busy === item.id || status === "draft"}
          style={({ pressed }) => ({
            marginTop: spacing.md,
            backgroundColor: status === "draft" ? colors.border : (pressed ? "#1f1f23" : colors.fg),
            paddingVertical: 11, borderRadius: radii.md, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
            opacity: status === "draft" ? 0.5 : 1,
          })}>
          {busy === item.id ? <ActivityIndicator color="#fff" size="small"/> : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{status === "draft" ? "Not yet published" : "Download PDF"}</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
      data={items}
      keyExtractor={(it) => it.id || it.period_month}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListEmptyComponent={
        <View style={{ alignItems: "center", paddingVertical: spacing.xxl * 2 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.fg }}>No payslips yet</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6, textAlign: "center" }}>
            Your payslips will appear here once HR runs and publishes payroll.
          </Text>
        </View>
      }
      ListHeaderComponent={
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: spacing.md }}>Tap a payslip to download as PDF.</Text>
      }
    />
  );
}

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatPeriod(pm) {
  if (!pm) return "—";
  const [y, m] = pm.split("-");
  return `${MONTHS[parseInt(m, 10)] || m} ${y}`;
}
