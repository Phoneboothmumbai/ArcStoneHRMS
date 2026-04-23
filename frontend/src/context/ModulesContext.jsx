import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

const ModulesContext = createContext({ active: [], loading: true });

export function ModulesProvider({ children }) {
  const { user } = useAuth();
  const [active, setActive] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/modules/mine");
      setActive(data.active_modules || []);
    } catch {
      setActive(["base_hrms"]);
    } finally { setLoading(false); }
  }, []);

  // Refetch whenever the authenticated user changes (login, logout, tenant switch).
  // This fixes the race where ModulesProvider mounts before AuthContext hydrates,
  // which would otherwise hide every module-gated sidebar entry until a manual reload.
  useEffect(() => {
    if (user && user !== false) {
      refresh();
    } else if (user === false) {
      setActive([]);
      setLoading(false);
    }
  }, [user, refresh]);

  return (
    <ModulesContext.Provider value={{ active, loading, refresh }}>
      {children}
    </ModulesContext.Provider>
  );
}

export function useModules() {
  return useContext(ModulesContext);
}

export function useHasModule(moduleId) {
  const { active } = useModules();
  return active.includes(moduleId) || active.includes("*"); // * reserved for super_admin universal access
}
