import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = logged out, object = logged in
  const [bootstrapping, setBootstrapping] = useState(true);

  const hydrate = useCallback(async () => {
    const token = await AsyncStorage.getItem("access_token");
    if (!token) {
      setUser(false);
      setBootstrapping(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      await AsyncStorage.multiRemove(["access_token", "refresh_token", "user"]);
      setUser(false);
    } finally {
      setBootstrapping(false);
    }
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    await AsyncStorage.multiSet([
      ["access_token", data.access_token],
      ["user", JSON.stringify(data.user)],
    ]);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    await AsyncStorage.multiRemove(["access_token", "refresh_token", "user"]);
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, bootstrapping, login, logout, refresh: hydrate }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
