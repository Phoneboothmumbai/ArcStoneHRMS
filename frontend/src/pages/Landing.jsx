import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle, Globe, Stack, TreeStructure, Users, Buildings, CurrencyDollar, ShieldCheck, Lightning } from "@phosphor-icons/react";
import { Button } from "../components/ui/button";

const FEATURES = [
  { icon: TreeStructure, label: "Multi-region hierarchy", text: "Regions → Countries → Branches → Departments. Model any org, from 50 to 50,000." },
  { icon: ShieldCheck, label: "Multi-level approvals", text: "Sequential, parallel, or conditional chains for leave, expenses, product/service requests." },
  { icon: Users, label: "Every employee type", text: "Work from office, WFH, field, hybrid. Geofenced check-ins and policy per type." },
  { icon: Buildings, label: "Reseller program", text: "White-label, recurring commissions, and your own pricing shelf — built in." },
  { icon: Lightning, label: "API-first", text: "Every module is a typed REST endpoint. Build mobile, kiosks, or integrations at will." },
  { icon: Globe, label: "Compliance ready", text: "Per-country policies, locale formats, and role-scoped data isolation out of the box." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950" data-testid="landing-root">
      {/* Nav */}
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 border-b border-zinc-200/60" data-testid="landing-nav">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-zinc-950 text-white flex items-center justify-center rounded-sm font-display font-black text-xs">A</div>
            <div className="font-display font-black text-lg leading-none">Arcstone<span className="text-zinc-400 font-normal"> / HRMS</span></div>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#platform" className="hover:text-zinc-600 transition-colors">Platform</a>
            <a href="#reseller" className="hover:text-zinc-600 transition-colors">Reseller program</a>
            <a href="#architecture" className="hover:text-zinc-600 transition-colors">Architecture</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost" size="sm" data-testid="nav-login-btn">Sign in</Button></Link>
            <Link to="/login"><Button size="sm" className="bg-zinc-950 hover:bg-zinc-800 text-white rounded-md" data-testid="nav-demo-btn">Book a demo</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative hrms-grid-bg" data-testid="hero-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-24 pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1 border border-zinc-200 rounded-full bg-white/80 text-xs tracking-wide" data-testid="hero-badge">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="text-zinc-700">Operating in 27 countries · 142 resellers</span>
              </div>
              <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight mt-6" data-testid="hero-title">
                The HRMS<br />
                <span className="text-zinc-500">built for the</span><br />
                multi-country enterprise.
              </h1>
              <p className="text-lg text-zinc-600 max-w-xl mt-8 leading-relaxed" data-testid="hero-sub">
                Run every office, every branch, every approval — in one workspace. Resell it under your brand. From 100 to 100,000 employees without a re-architecture.
              </p>
              <div className="flex items-center gap-3 mt-10" data-testid="hero-cta-row">
                <Link to="/login">
                  <Button size="lg" className="bg-zinc-950 hover:bg-zinc-800 text-white rounded-md h-12 px-6" data-testid="hero-start-btn">
                    Start a 14-day trial
                    <ArrowUpRight size={18} weight="bold" className="ml-1.5" />
                  </Button>
                </Link>
                <a href="#reseller">
                  <Button variant="outline" size="lg" className="rounded-md h-12 px-6 border-zinc-300" data-testid="hero-reseller-btn">
                    Become a reseller
                  </Button>
                </a>
              </div>

              <div className="grid grid-cols-3 gap-6 mt-16 pt-10 border-t border-zinc-200 max-w-xl" data-testid="hero-stats">
                <Stat label="Active companies" value="240+" />
                <Stat label="Employees tracked" value="168k" />
                <Stat label="Countries" value="27" />
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="relative" data-testid="hero-visual">
                <div className="absolute -inset-4 bg-zinc-950/5 rounded-2xl -rotate-1"></div>
                <div className="relative bg-zinc-950 rounded-xl overflow-hidden shadow-xl border border-zinc-900">
                  <img
                    src="https://images.unsplash.com/photo-1610741804272-059e1d3c5dba?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMG1vZGVybiUyMG9mZmljZSUyMGFyY2hpdGVjdHVyZXxlbnwwfHx8fDE3NzY5Mzg5MDZ8MA&ixlib=rb-4.1.0&q=85"
                    alt="Architecture"
                    className="w-full h-[560px] object-cover opacity-80"
                  />
                  <div className="absolute inset-x-6 bottom-6 bg-white rounded-md border border-zinc-200 p-5">
                    <div className="tiny-label">Live approval chain</div>
                    <div className="mt-3 space-y-3">
                      <Step name="Aisha Khan" role="Employee" status="Requested" />
                      <Step name="Rahul Verma" role="Branch Manager" status="Approved" ok />
                      <Step name="Priya Sharma" role="HR Admin" status="In review" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-24 border-t border-zinc-200 bg-white" id="platform" data-testid="features-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="tiny-label">The platform</div>
            <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-tight leading-tight mt-4">Built for scale. Priced for growth.</h2>
            <p className="text-zinc-600 mt-4">Modular architecture, zero-trust multi-tenancy, and a shared foundation — so you ship new HR experiences in days, not quarters.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 mt-16 border-t border-l border-zinc-200">
            {FEATURES.map((f, i) => (
              <div key={i} className="border-b border-r border-zinc-200 p-8 hover:bg-zinc-50 transition-colors" data-testid={`feature-${i}`}>
                <f.icon size={22} weight="regular" className="text-zinc-950" />
                <div className="font-display font-semibold text-lg mt-4">{f.label}</div>
                <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reseller */}
      <section className="py-28 bg-zinc-950 text-white" id="reseller" data-testid="reseller-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="tiny-label text-zinc-400">The reseller program</div>
            <h2 className="font-display font-bold text-4xl sm:text-5xl leading-tight tracking-tight mt-4">Your brand. Our engine. Recurring revenue.</h2>
            <p className="text-zinc-400 mt-6 text-lg max-w-xl leading-relaxed">Onboard companies under your own brand and domain. Keep 15–30% of every monthly subscription. We handle the infra, you own the relationship.</p>
            <ul className="mt-10 space-y-4" data-testid="reseller-benefits">
              {["White-label portal & custom domain", "Onboard unlimited companies", "Automated commission tracking", "Dedicated partner success manager"].map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <CheckCircle size={18} weight="fill" className="text-emerald-400 mt-0.5" />
                  <span className="text-zinc-200">{t}</span>
                </li>
              ))}
            </ul>
            <Link to="/login"><Button className="bg-white text-zinc-950 hover:bg-zinc-100 mt-10 h-12 px-6 rounded-md" data-testid="reseller-apply-btn">
              Apply to partner <ArrowUpRight size={18} weight="bold" className="ml-1.5" />
            </Button></Link>
          </div>
          <div className="lg:col-span-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8" data-testid="reseller-calc">
              <div className="tiny-label text-zinc-500">Commission preview</div>
              <div className="font-display font-black text-6xl mt-4 tracking-tight">$12,480<span className="text-zinc-500 text-2xl">/mo</span></div>
              <div className="text-sm text-zinc-400 mt-2">40 companies · Growth plan · 20% rate</div>
              <div className="mt-8 space-y-3 text-sm">
                <Row label="Monthly subscription" value="$62,400" />
                <Row label="Commission rate" value="20%" />
                <Row label="Your payout" value="$12,480" strong />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture note */}
      <section className="py-24 bg-white border-t border-zinc-200" id="architecture" data-testid="architecture-section">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="tiny-label">Architecture</div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl leading-tight tracking-tight mt-4 max-w-3xl">A four-tier model. Zero data leaks. Built to reach 100,000 employees.</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-14" data-testid="arch-grid">
            <Tier num="01" title="Platform" text="Super admin governs resellers, billing, observability." />
            <Tier num="02" title="Reseller" text="White-labels & onboards tenant companies, tracks commissions." />
            <Tier num="03" title="Tenant (Company)" text="HR admins shape regions, countries, branches, departments." />
            <Tier num="04" title="People" text="Managers run teams. Employees self-serve leave, attendance, requests." />
          </div>
        </div>
      </section>

      <footer className="py-10 border-t border-zinc-200 bg-zinc-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-sm text-zinc-500 flex items-center justify-between flex-wrap gap-4">
          <div>© 2026 Arcstone HRMS. Engineered for the multi-country enterprise.</div>
          <div>Multi-tenant · SOC 2-ready · API-first</div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="font-display font-bold text-3xl tracking-tight">{value}</div>
      <div className="tiny-label mt-1">{label}</div>
    </div>
  );
}

function Step({ name, role, status, ok }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${ok ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-900 border border-zinc-200"}`}>
          {ok ? "✓" : "·"}
        </div>
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-xs text-zinc-500">{role}</div>
        </div>
      </div>
      <div className={`text-xs ${ok ? "text-emerald-600" : "text-zinc-500"}`}>{status}</div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between pb-3 border-b border-zinc-800 last:border-0">
      <span className="text-zinc-400">{label}</span>
      <span className={strong ? "text-white font-semibold" : "text-zinc-200"}>{value}</span>
    </div>
  );
}

function Tier({ num, title, text }) {
  return (
    <div className="border-l-2 border-zinc-950 pl-5 py-2">
      <div className="tiny-label">{num}</div>
      <div className="font-display font-semibold text-lg mt-2">{title}</div>
      <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{text}</p>
    </div>
  );
}
