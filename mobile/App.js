import { registerRootComponent } from "expo";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import React, { useEffect } from "react";
import * as Notifications from "expo-notifications";
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

function App() {
  useEffect(() => {
    // Register for push after a short delay so AuthContext hydrates first
    const t = setTimeout(registerForPush, 2500);
    return () => clearTimeout(t);
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
