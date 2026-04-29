import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Image, Linking,
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../lib/api";
import { colors } from "../lib/theme";
import {
  requestPermissions, startLocationTracking, stopLocationTracking, isTracking,
} from "../lib/locationTask";

export default function AttendanceScreen() {
  const [boot, setBoot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [tracking, setTrackingState] = useState(false);
  const [lastLoc, setLastLoc] = useState(null);
  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get("/mobile/me");
      setBoot(r.data);
    } catch (e) { Alert.alert("Error", formatError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    refresh();
    isTracking().then(setTrackingState);
  }, []);

  const today = boot?.today || {};
  const checkedIn = !!today.checked_in_at && !today.checked_out_at;

  // Returns:
  //   { ok: true, base64 }     - selfie captured
  //   { ok: false, cancelled } - user cancelled / denied → caller must abort
  const captureSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Camera permission needed", "Please grant camera access in Settings to take your check-in selfie.",
        [{ text: "Open Settings", onPress: () => Linking.openSettings() }, { text: "Cancel" }]);
      return { ok: false, cancelled: true };
    }
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5,
      base64: true, cameraType: ImagePicker.CameraType.front,
    });
    if (r.canceled) return { ok: false, cancelled: true };
    const b64 = r.assets?.[0]?.base64;
    if (!b64) return { ok: false, cancelled: true };
    return { ok: true, base64: b64 };
  };

  const getCurrentLocation = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.status !== "granted") {
      Alert.alert("Location permission needed", "Allow location access to check in.",
        [{ text: "Open Settings", onPress: () => Linking.openSettings() }, { text: "Cancel" }]);
      return null;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return loc.coords;
  };

  const onCheckIn = async () => {
    setWorking(true);
    try {
      const coords = await getCurrentLocation();
      if (!coords) return;
      setLastLoc(coords);
      const selfie = await captureSelfie();
      if (!selfie.ok) {
        // User cancelled or denied the camera — abort silently, no check-in.
        return;
      }
      // Upload check-in
      const r = await api.post("/mobile/checkin", {
        latitude: coords.latitude, longitude: coords.longitude,
        accuracy: coords.accuracy, selfie_b64: selfie.base64,
      });
      // Refresh state immediately so UI reflects success even if tracking fails
      refresh();
      const isWfh = r.data?.site === "Work from home";
      Alert.alert(
        "Checked in ✓",
        isWfh
          ? "Marked present from home. Have a great day!"
          : `Site: ${r.data.site}\nDistance: ${r.data.distance_m} m`,
      );
      // Trigger background tracking — failure here MUST NOT report check-in failed.
      try {
        const perms = await requestPermissions();
        if (perms.ok && perms.background) {
          await startLocationTracking();
          setTrackingState(true);
        } else if (perms.ok && !perms.background) {
          Alert.alert(
            "Foreground tracking only",
            "Background location permission was not granted. Open Settings → Permissions → Location → Allow all the time so we can track your work location while the app is in the background.",
            [{ text: "Open Settings", onPress: () => Linking.openSettings() }, { text: "Skip" }],
          );
        }
      } catch (trackErr) {
        // Don't surface this as a check-in failure — log silently and let user retry tracking from settings.
        console.warn("Tracking start failed:", trackErr?.message);
      }
    } catch (e) { Alert.alert("Check-in failed", formatError(e)); }
    finally { setWorking(false); }
  };

  const onCheckOut = async () => {
    setWorking(true);
    try {
      const coords = await getCurrentLocation();
      if (!coords) return;
      setLastLoc(coords);
      const selfie = await captureSelfie();
      if (!selfie.ok) return;   // user cancelled — don't checkout
      const r = await api.post("/mobile/checkout", {
        latitude: coords.latitude, longitude: coords.longitude,
        accuracy: coords.accuracy, selfie_b64: selfie.base64,
      });
      // Stop tracking, but failure here shouldn't surface as a check-out error.
      try {
        await stopLocationTracking();
        setTrackingState(false);
      } catch (trackErr) {
        console.warn("Tracking stop failed:", trackErr?.message);
      }
      Alert.alert("Checked out ✓", `Hours worked: ${r.data.hours || "—"}`);
      refresh();
    } catch (e) { Alert.alert("Check-out failed", formatError(e)); }
    finally { setWorking(false); }
  };

  if (loading && !boot) return (
    <View style={styles.center}><ActivityIndicator size="large" color={colors.fg}/></View>
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.header}>
        <Text style={styles.heading}>Attendance</Text>
        <Text style={styles.sub}>{boot?.employee?.name} · {boot?.employee?.code}</Text>
      </View>

      <View style={[styles.card, checkedIn && styles.cardActive]}>
        <Text style={styles.cardLabel}>Today · {today.date || "—"}</Text>
        <Text style={styles.cardValue}>
          {checkedIn ? "Checked in" : today.checked_out_at ? "Day complete" : "Not checked in"}
        </Text>
        {today.checked_in_at && (
          <Text style={styles.cardSub}>
            In: {new Date(today.checked_in_at).toLocaleTimeString()}
            {today.site_name && ` · ${today.site_name}`}
          </Text>
        )}
        {today.checked_out_at && (
          <Text style={styles.cardSub}>Out: {new Date(today.checked_out_at).toLocaleTimeString()}</Text>
        )}
        {tracking && checkedIn && (
          <View style={styles.trackingBadge}>
            <View style={styles.dot}/>
            <Text style={styles.trackingText}>Live tracking active</Text>
          </View>
        )}
      </View>

      {!today.checked_out_at && (
        checkedIn ? (
          <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={onCheckOut} disabled={working}>
            {working ? <ActivityIndicator color="#fff"/> : (
              <>
                <Ionicons name="log-out-outline" size={18} color="#fff" style={{ marginRight: 8 }}/>
                <Text style={styles.btnText}>Check out with selfie</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onCheckIn} disabled={working}>
            {working ? <ActivityIndicator color="#fff"/> : (
              <>
                <Ionicons name="finger-print-outline" size={18} color="#fff" style={{ marginRight: 8 }}/>
                <Text style={styles.btnText}>Check in with selfie</Text>
              </>
            )}
          </TouchableOpacity>
        )
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Authorized work sites</Text>
        {(boot?.work_sites || []).map(s => (
          <View key={s.id} style={styles.siteRow}>
            <Ionicons name="location-outline" size={16} color={colors.muted}/>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.siteName}>{s.name}</Text>
              <Text style={styles.siteCoord}>{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)} · {s.radius_meters}m</Text>
            </View>
          </View>
        ))}
        {(boot?.work_sites || []).length === 0 && (
          <Text style={styles.empty}>No geofenced sites configured. Ask HR to add your office in the admin panel.</Text>
        )}
      </View>

      <View style={styles.privacyBox}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.muted}/>
        <Text style={styles.privacyText}>
          Location is only tracked between your check-in and check-out. We never collect data outside working hours.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { padding: 20, paddingBottom: 8 },
  heading: { fontSize: 24, fontWeight: "800", color: colors.fg },
  sub: { color: colors.muted, marginTop: 2, fontSize: 13 },
  card: { margin: 16, padding: 20, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  cardActive: { borderColor: "#10b981", backgroundColor: "#ecfdf5" },
  cardLabel: { color: colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700" },
  cardValue: { color: colors.fg, fontSize: 22, fontWeight: "800", marginTop: 6 },
  cardSub: { color: colors.muted, fontSize: 13, marginTop: 4 },
  trackingBadge: { flexDirection: "row", alignItems: "center", marginTop: 12, padding: 8,
                   backgroundColor: "#fff", borderRadius: 8, alignSelf: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444", marginRight: 6 },
  trackingText: { color: "#065f46", fontSize: 12, fontWeight: "700" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center",
         paddingVertical: 16, marginHorizontal: 16, borderRadius: 12 },
  btnPrimary: { backgroundColor: "#10b981" },
  btnDanger: { backgroundColor: "#dc2626" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.fg, marginBottom: 8,
                  textTransform: "uppercase", letterSpacing: 0.5 },
  siteRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10,
             borderBottomWidth: 1, borderBottomColor: colors.border },
  siteName: { color: colors.fg, fontSize: 14, fontWeight: "600" },
  siteCoord: { color: colors.muted, fontSize: 11, marginTop: 2 },
  empty: { color: colors.muted, fontSize: 13, fontStyle: "italic", paddingVertical: 8 },
  privacyBox: { flexDirection: "row", margin: 16, padding: 12, backgroundColor: "#f4f4f5",
                borderRadius: 8, alignItems: "flex-start" },
  privacyText: { flex: 1, marginLeft: 8, color: colors.muted, fontSize: 12, lineHeight: 16 },
});
