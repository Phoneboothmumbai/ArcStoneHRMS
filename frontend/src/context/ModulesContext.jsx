import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

const ModulesContext = createContext({ active: [], loading: true });

export function ModulesProvider({ children }) {
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

  useEffect(() => { refresh(); }, [refresh]);

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
