import { Link, useLocation } from "react-router-dom";
import AppShell from "../components/AppShell";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { routeForRole } from "../context/AuthContext";
import { Compass } from "@phosphor-icons/react";

export default function NotFound() {
  const { user } = useAuth();
  const location = useLocation();
  const home = user && user !== false ? routeForRole(user.role) : "/login";

  return (
    <AppShell title="Page not found">
      <div className="min-h-[60vh] flex items-center justify-center" data-testid="app-404">
        <div className="text-center max-w-md">
          <div className="inline-flex w-16 h-16 rounded-full bg-zinc-100 items-center justify-center mb-4">
            <Compass size={28} weight="duotone" className="text-zinc-500"/>
          </div>
          <div className="text-5xl font-bold tracking-tight text-zinc-900 mb-2">404</div>
          <h2 className="text-base font-semibold text-zinc-900 mb-1">We couldn't find that page</h2>
          <p className="text-sm text-zinc-500 mb-6">
            <span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">{location.pathname}</span> doesn't exist or you don't have access.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link to={home}>
              <Button className="bg-zinc-950 hover:bg-zinc-800" data-testid="404-home-btn">Back to dashboard</Button>
            </Link>
            <Link to="/app/help">
              <Button variant="outline" data-testid="404-help-btn">Visit help center</Button>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
