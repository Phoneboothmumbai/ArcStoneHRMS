/**
 * Background location tracking task — runs on Android even when the app is killed.
 *
 * Architecture:
 *   • startLocationTracking() is called immediately after a successful check-in.
 *   • TaskManager registers BG_LOCATION_TASK; expo-location dispatches every ~60 s.
 *   • The task buffers ping batches in AsyncStorage when offline, flushes when online.
 *   • stopLocationTracking() is called on check-out / logout.
 *
 * Important: TaskManager.defineTask MUST be called at module-import time so it's
 * registered before the OS resurrects the JS runtime in the background.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";

export const BG_LOCATION_TASK = "arcstone-bg-location";
const QUEUE_KEY = "arcstone-location-queue";
const MAX_QUEUE = 500;        // safety cap

const BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "http://138.199.146.191";

async function flushQueue() {
  const token = await AsyncStorage.getItem("access_token");
  if (!token) return;
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue = raw ? JSON.parse(raw) : [];
  if (queue.length === 0) return;
  try {
    await axios.post(
      `${BASE_URL}/api/mobile/locations/ping`,
      { pings: queue, device_id: Constants.sessionId || "device" },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
    );
    // Successfully flushed → clear queue
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch (err) {
    // Network down — keep queued, will retry next batch
  }
}

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = data?.locations || [];
  if (!locations.length) return;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    for (const loc of locations) {
      queue.push({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        speed: loc.coords.speed,
        heading: loc.coords.heading,
        captured_at: new Date(loc.timestamp).toISOString(),
      });
    }
    // Trim if huge
    const trimmed = queue.slice(-MAX_QUEUE);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
    await flushQueue();
  } catch (e) {
    // swallow — never crash the background task
  }
});

export async function requestPermissions() {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== "granted") return { ok: false, reason: "foreground_denied" };
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  // Background may be denied on first install; tracking still works in foreground
  return { ok: true, background: bg === "granted" };
}

export async function startLocationTracking() {
  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
  if (running) return { already: true };
  await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,                  // every 60 seconds
    distanceInterval: 30,                  // OR every 30m moved
    deferredUpdatesInterval: 60_000,       // batch on Android
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Arcstone is tracking your work location",
      notificationBody: "Tracking is active until you check out.",
      notificationColor: "#10b981",
    },
    pausesUpdatesAutomatically: false,
  });
  return { started: true };
}

export async function stopLocationTracking() {
  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
  if (!running) return { already: false };
  await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  await flushQueue();   // one last flush
  return { stopped: true };
}

export async function isTracking() {
  return Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
}

export { flushQueue };
