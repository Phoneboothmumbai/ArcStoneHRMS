import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

const EmploymentClassContext = createContext({
  employmentClass: "on_roll",
  permissions: {},
  loading: true,
  refresh: () => {},
});

export function EmploymentClassProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({
    employmentClass: "on_roll",
    permissions: {},
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/employment-class/permissions");
      setState({
        employmentClass: data.employment_class || "on_roll",
        permissions: data.permissions || {},
        loading: false,
      });
    } catch {
      // Conservative fallback: everything allowed (fail-open, server still enforces)
      setState({ employmentClass: "on_roll", permissions: {}, loading: false });
    }
  }, []);

  useEffect(() => {
    if (user && user !== false) {
      refresh();
    } else if (user === false) {
      setState({ employmentClass: "on_roll", permissions: {}, loading: false });
    }
  }, [user, refresh]);

  return (
    <EmploymentClassContext.Provider value={{ ...state, refresh }}>
      {children}
    </EmploymentClassContext.Provider>
  );
}

export const useEmploymentClass = () => useContext(EmploymentClassContext);

/**
 * Check if the current user's employment class has access to a feature.
 * Returns true if key is absent (fail-open — backend remains source of truth).
 */
export function useFeatureAllowed(featureKey) {
  const { permissions, loading } = useContext(EmploymentClassContext);
  if (loading) return true;
  if (permissions[featureKey] === undefined) return true;
  return permissions[featureKey] === true;
}
