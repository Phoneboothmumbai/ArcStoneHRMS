import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator, ScrollView, RefreshControl } from "react-native";
import * as Location from "expo-location";
import { api, formatError } from "../lib/api";
import { colors, spacing, radii, typography } from "../lib/theme";

export default function AttendanceScreen() {
  const [today, setToday] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const [t, r] = await Promise.all([
        api.get("/attendance/today").catch(() => ({ data: null })),
        api.get("/attendance"),
      ]);
      setToday(t.data);
      setRecent((r.data || []).slice(0, 7));
    } catch (e) { Alert.alert("Error", formatError(e)); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  const checkIn = async () => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setBusy(false);
        return Alert.alert("Location required", "Location access is needed to verify your work site.");
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post("/attendance/checkin", {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy_m: loc.coords.accuracy || null,
      });
      Alert.alert("Checked in", "Have a productive day!");
      load();
    } catch (e) { Alert.alert("Check-in failed", formatError(e)); }
    finally { setBusy(false); }
  };

  const checkOut = async () => {
    setBusy(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post("/attendance/checkout", {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      Alert.alert("Checked out", "See you tomorrow.");
      load();
    } catch (e) { Alert.alert("Check-out failed", formatError(e)); }
    finally { setBusy(false); }
  };

  const checkedIn = today?.check_in && !today?.check_out;
  const completed = today?.check_in && today?.check_out;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load}/>}
    >
      <View style={{ backgroundColor: colors.card, padding: spacing.xl, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
        <Text style={[typography.tiny, { color: colors.muted }]}>TODAY</Text>
        <Text style={{ fontSize: 36, fontWeight: "900", marginTop: spacing.sm }}>
          {today?.check_in ? formatTime(today.check_in) : "--:--"}
          <Text style={{ color: colors.muted, fontSize: 20 }}> → </Text>
          {today?.check_out ? formatTime(today.check_out) : "--:--"}
        </Text>
        <Text style={{ color: colors.muted, marginTop: spacing.xs }}>
          {completed ? `Worked ${computeHours(today.check_in, today.check_out).toFixed(1)} h`
            : checkedIn ? "Checked in — don't forget to check out"
            : "Tap below to start your day"}
        </Text>

        {!completed && (
          <Pressable
            onPress={checkedIn ? checkOut : checkIn}
            disabled={busy}
            style={({ pressed }) => ({
              backgroundColor: checkedIn ? colors.danger : colors.accent,
              marginTop: spacing.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
              borderRadius: radii.pill, opacity: pressed || busy ? 0.7 : 1,
            })}
          >
            {busy ? <ActivityIndicator color="#fff"/> :
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                {checkedIn ? "Check out" : "Check in"}
              </Text>}
          </Pressable>
        )}
      </View>

      <Text style={[typography.h3, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>Last 7 days</Text>
      {recent.map((r) => (
        <View key={r.id || r.date} style={{ backgroundColor: colors.card, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontWeight: "600" }}>{r.date}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {r.check_in ? formatTime(r.check_in) : "—"} → {r.check_out ? formatTime(r.check_out) : "—"}
            </Text>
          </View>
          <Text style={{ color: r.status === "present" ? colors.success : colors.muted, fontWeight: "600", fontSize: 12, textTransform: "uppercase", alignSelf: "center" }}>
            {r.status || "—"}
          </Text>
        </View>
      ))}
      {recent.length === 0 && <Text style={{ color: colors.muted, textAlign: "center", padding: spacing.xl }}>No recent attendance records</Text>}
    </ScrollView>
  );
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return "--:--"; }
}
function computeHours(a, b) {
  return (new Date(b) - new Date(a)) / 3.6e6;
}
