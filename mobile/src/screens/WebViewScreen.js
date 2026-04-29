import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, RefreshControl, ScrollView, BackHandler } from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../lib/theme";

const BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "http://138.199.146.191";

/**
 * Reusable WebView wrapper. Loads any web app route inside the native shell,
 * pre-injecting the JWT into localStorage so the user is auto-logged-in.
 *
 * Usage:
 *   <WebViewScreen path="/app/policies" />
 *
 * The `?embed=mobile` query is appended automatically — the web AppShell
 * detects it and hides the sidebar/header so only page content renders.
 */
export default function WebViewScreen({ route, navigation }) {
  const path = route?.params?.path || "/app/employee";
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);
  const [loadKey, setLoadKey] = useState(0);
  const webRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem("access_token").then(t => setToken(t || ""));
  }, []);

  // Hardware back button → goBack inside the webview if possible
  useFocusEffect(React.useCallback(() => {
    const onBack = () => {
      if (webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, []));

  if (token === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.fg}/>
      </View>
    );
  }

  if (!token) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 24, alignItems: "center", justifyContent: "center", flex: 1 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => setLoadKey(k=>k+1)}/>}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.fg, marginBottom: 8 }}>Session expired</Text>
        <Text style={{ color: colors.muted, textAlign: "center" }}>Please go back and sign in again.</Text>
      </ScrollView>
    );
  }

  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${sep}embed=mobile`;

  // Inject token + a postMessage hook for native↔web bridging.
  // Note: token is injected at runtime through props; we don't bake it
  // into JS source so different sessions don't leak through bundling.
  const injectedJavaScriptBeforeContentLoaded = `
    (function() {
      try {
        localStorage.setItem("hrms_token", ${JSON.stringify(token)});
        sessionStorage.setItem("embed_mobile", "1");
      } catch(e) {}
      true;
    })();
  `;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {error ? (
        <ScrollView
          contentContainerStyle={{ padding: 24, alignItems: "center", justifyContent: "center", flex: 1 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => { setError(null); setLoadKey(k => k+1); }} />}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.danger, marginBottom: 8 }}>Couldn't load page</Text>
          <Text style={{ color: colors.muted, textAlign: "center" }}>{error}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 16 }}>Pull down to retry.</Text>
        </ScrollView>
      ) : (
        <WebView
          key={loadKey}
          ref={webRef}
          source={{ uri: url }}
          injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
          startInLoadingState
          renderLoading={() => (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
              <ActivityIndicator size="large" color={colors.fg}/>
            </View>
          )}
          onError={(e) => setError(e.nativeEvent?.description || "Network error")}
          onHttpError={(e) => {
            const c = e.nativeEvent?.statusCode;
            if (c >= 500) setError(`Server error (${c}). Try again.`);
          }}
          sharedCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          allowFileAccess
          mixedContentMode="always"
          originWhitelist={["*"]}
          pullToRefreshEnabled
          style={{ flex: 1, backgroundColor: colors.bg }}
        />
      )}
    </View>
  );
}
