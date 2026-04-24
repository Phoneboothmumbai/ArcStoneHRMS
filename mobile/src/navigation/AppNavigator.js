import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth, AuthProvider } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import AttendanceScreen from "../screens/AttendanceScreen";
import LeaveScreen from "../screens/LeaveScreen";
import ApprovalsScreen from "../screens/ApprovalsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import { colors } from "../lib/theme";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  const { user } = useAuth();
  const isManager = ["branch_manager", "sub_manager", "assistant_manager", "company_admin"].includes(user?.role);
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.fg,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen}/>
      <Tab.Screen name="Attendance" component={AttendanceScreen}/>
      <Tab.Screen name="Leave" component={LeaveScreen}/>
      {isManager && <Tab.Screen name="Approvals" component={ApprovalsScreen}/>}
      <Tab.Screen name="Profile" component={ProfileScreen}/>
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Main" component={Tabs}/>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen}/>
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
