import { registerRootComponent } from "expo";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import React from "react";
import AppNavigator from "./src/navigation/AppNavigator";

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark"/>
      <AppNavigator/>
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
export default App;
