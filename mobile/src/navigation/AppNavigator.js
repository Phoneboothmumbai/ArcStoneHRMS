import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Pressable, Alert } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth, AuthProvider } from "../context/AuthContext";
import { api } from "../lib/api";

import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import AttendanceScreen from "../screens/AttendanceScreen";
import LeaveScreen from "../screens/LeaveScreen";
import ApprovalsScreen from "../screens/ApprovalsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import PayslipsScreen from "../screens/PayslipsScreen";
import ExpensesScreen from "../screens/ExpensesScreen";
import MoreScreen from "../screens/MoreScreen";
import WebViewScreen from "../screens/WebViewScreen";
import { colors } from "../lib/theme";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ glyph, focused, badge }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", height: 28 }}>
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>
      {badge > 0 ? (
        <View style={{ position: "absolute", top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Inbox = unified Notifications (employee) + Approvals (manager).
 * Switches via tabs at the top of the screen for managers.
 */
function InboxScreen({ navigation }) {
  const { user } = useAuth();
  const isManager = ["branch_manager", "sub_manager", "assistant_manager", "company_admin"].includes(user?.role);
  const [tab, setTab] = useState(isManager ? "approvals" : "notifications");
  if (!isManager) return <NotificationsScreen navigation={navigation}/>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", padding: 8, gap: 8, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border }}>
        {[
          { v: "approvals",     label: "Approvals" },
          { v: "notifications", label: "Notifications" },
        ].map(t => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={{
            flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center",
            backgroundColor: tab === t.v ? colors.fg : "transparent",
          }}>
            <Text style={{ color: tab === t.v ? "#fff" : colors.fg, fontWeight: "700", fontSize: 13 }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {tab === "approvals" ? <ApprovalsScreen navigation={navigation}/> : <NotificationsScreen navigation={navigation}/>}
      </View>
    </View>
  );
}

function MainTabs() {
  const [unread, setUnread] = useState(0);

  // Light polling for the badge — refreshes every focus and every 60s.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get("/notifications/unread_count");
        if (!cancelled) setUnread(data?.count ?? data?.unread_count ?? 0);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.fg,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 62, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      <Tab.Screen name="Home"       component={HomeScreen}       options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="🏠" focused={focused}/> }}/>
      <Tab.Screen name="Attendance" component={AttendanceScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="🕐" focused={focused}/> }}/>
      <Tab.Screen name="Leave"      component={LeaveScreen}      options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="📅" focused={focused}/> }}/>
      <Tab.Screen name="Inbox"      component={InboxScreen}      options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="🔔" focused={focused} badge={unread}/> }}/>
      <Tab.Screen name="More"       component={MoreScreen}       options={{ tabBarIcon: ({ focused }) => <TabIcon glyph="⋯" focused={focused}/> }}/>
    </Tab.Navigator>
  );
}

function Root() {
  const { user, bootstrapping } = useAuth();
  if (bootstrapping) return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={colors.fg}/>
      <Text style={{ color: colors.muted, marginTop: 12 }}>Loading…</Text>
    </View>
  );
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTitleStyle: { fontWeight: "800" }, headerTintColor: colors.fg }}>
      {user ? (
        <>
          <Stack.Screen name="Main"         component={MainTabs}            options={{ headerShown: false }}/>
          <Stack.Screen name="Profile"      component={ProfileScreen}       options={{ title: "My Profile" }}/>
          <Stack.Screen name="Payslips"     component={PayslipsScreen}      options={{ title: "Payslips" }}/>
          <Stack.Screen name="Expenses"     component={ExpensesScreen}      options={{ title: "Expenses & Travel" }}/>
          <Stack.Screen name="WebView"      component={WebViewScreen}       options={({ route }) => ({ title: route.params?.title || "Arcstone" })}/>
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }}/>
      )}
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Root/>
      </NavigationContainer>
    </AuthProvider>
  );
}
