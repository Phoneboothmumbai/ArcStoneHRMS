import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, routeForRole } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ArrowLeft, IdentificationCard } from "@phosphor-icons/react";

const DEMOS = [
  { label: "Super admin", email: "admin@hrms.io", password: "Admin@123" },
  { label: "Reseller", email: "reseller@demo.io", password: "Reseller@123" },
  { label: "HR admin", email: "hr@acme.io", password: "Hr@12345" },
  { label: "Manager", email: "manager@acme.io", password: "Manager@123" },
  { label: "Employee", email: "employee@acme.io", password: "Employee@123" },
];

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(routeForRole(user.role), { replace: true });
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  const quick = (d) => {
    setEmail(d.email);
    setPassword(d.password);
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-zinc-100" data-testid="login-root">
      <div className="flex flex-col justify-between p-8 lg:p-14 bg-zinc-950 text-white">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white" data-testid="login-back">
          <ArrowLeft size={16} /> Back to Arcstone
        </Link>
        <div>
          <div className="inline-flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-white text-zinc-950 flex items-center justify-center rounded-sm">
              <IdentificationCard weight="fill" size={20} />
            </div>
            <div className="font-display font-black text-xl">Arcstone HRMS</div>
          </div>
          <h1 className="font-display font-black text-4xl lg:text-5xl leading-tight tracking-tight" data-testid="login-side-title">
            One workspace. Every role.
          </h1>
          <p className="text-zinc-400 mt-6 text-lg max-w-md leading-relaxed">Sign in as super admin, reseller, HR, manager or employee — we'll route you to the right view.</p>
        </div>
        <div className="tiny-label text-zinc-500">© 2026 Arcstone</div>
      </div>

      <div className="flex items-center justify-center p-8 lg:p-14">
        <div className="w-full max-w-md" data-testid="login-form-wrap">
          <div className="tiny-label">Sign in</div>
          <h2 className="font-display font-bold text-3xl mt-2">Welcome back.</h2>
          <p className="text-sm text-zinc-500 mt-2">Use your work email to continue.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
            <div>
              <Label htmlFor="email" className="text-xs uppercase tracking-wider font-medium text-zinc-600">Work email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="mt-2 h-11 bg-white border-zinc-300 rounded-md"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs uppercase tracking-wider font-medium text-zinc-600">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="mt-2 h-11 bg-white border-zinc-300 rounded-md"
                data-testid="login-password-input"
              />
            </div>
            {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md" data-testid="login-error">{err}</div>}
            <Button type="submit" disabled={loading} className="w-full h-11 bg-zinc-950 hover:bg-zinc-800 rounded-md" data-testid="login-submit-btn">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-10" data-testid="demo-accounts-block">
            <div className="tiny-label">Demo accounts</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {DEMOS.map((d) => (
                <button
                  type="button"
                  key={d.label}
                  onClick={() => quick(d)}
                  className="text-xs px-3 py-1.5 border border-zinc-300 rounded-full hover:bg-zinc-950 hover:text-white transition-colors"
                  data-testid={`demo-${d.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
