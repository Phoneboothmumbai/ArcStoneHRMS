import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-100" data-testid="route-loader">
        <div className="tiny-label">Loading workspace…</div>
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}
