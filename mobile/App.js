import { registerRootComponent } from "expo";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import React, { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";

// IMPORTANT: import the background task module at top-level so TaskManager
// registers BG_LOCATION_TASK before the OS resurrects the JS runtime.
import "./src/lib/locationTask";
import AppNavigator from "./src/navigation/AppNavigator";
import { api } from "./src/lib/api";

// Show heads-up notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPush() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== "granted") return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    const auth = await AsyncStorage.getItem("access_token");
    if (token && auth) {
      try {
        await api.post("/mobile/push-token", { token, platform: "android" });
      } catch {}
    }
  } catch {}
}

// Check for OTA updates and apply them silently. Runs on launch and again
// each time the app returns from background — so any web-side feature push
// reaches the device within seconds of the next foreground.
async function checkForUpdates() {
  try {
    if (!Updates.isEnabled || __DEV__) return;
    const result = await Updates.checkForUpdateAsync();
    if (result?.isAvailable) {
      await Updates.fetchUpdateAsync();
      // Apply silently on next cold start to avoid jarring the user mid-task.
      // (Uncomment the next line to apply immediately.)
      // await Updates.reloadAsync();
    }
  } catch {}
}

function App() {
  useEffect(() => {
    const t = setTimeout(registerForPush, 2500);
    checkForUpdates();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") checkForUpdates();
    });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark"/>
      <AppNavigator/>
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
export default App;
