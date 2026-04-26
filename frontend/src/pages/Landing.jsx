import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle, Globe, Stack, TreeStructure, Users, Buildings, CurrencyDollar, ShieldCheck, Lightning, DeviceMobile, AndroidLogo, AppleLogo, DownloadSimple, Info, EnvelopeSimple } from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";

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
            <a href="#mobile-app" className="hover:text-zinc-600 transition-colors">Mobile app</a>
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

      {/* Mobile App download */}
      <MobileAppSection />

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

function MobileAppSection() {
  const [meta, setMeta] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    api.get("/public/mobile-app").then(r => setMeta(r.data)).catch(()=>{});
    // Capture Chrome/Edge/Samsung install prompt
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    // Detect already-installed
    const check = () => {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
      if (window.navigator.standalone) setInstalled(true); // iOS Safari A2HS flag
    };
    check();
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const apkAvailable = !!meta?.android?.apk_available;
  const backendBase = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
  const apkUrl = backendBase + "/api/public/mobile-app/android";
  const installUrl = (typeof window !== "undefined" ? window.location.origin : "") + "/login?utm_source=qr";
  const qrApk = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(apkAvailable ? apkUrl : installUrl)}`;
  const iosUrl = (meta && (meta.ios?.testflight_url || meta.ios?.app_store_url)) || installUrl;
  const qrIos = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(iosUrl)}`;

  const triggerInstall = async () => {
    if (installed) return;
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } else {
      // No install prompt fired — instruct the user (typical on Safari iOS, Firefox)
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/i.test(ua)) {
        setIosHelp(true);
      } else {
        alert("To install: open Chrome menu → 'Install app' (or 'Add to Home screen').");
      }
    }
  };

  return (
    <section id="mobile-app" className="py-24 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white" data-testid="mobile-app-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left — pitch */}
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-zinc-700 rounded-full bg-zinc-900 text-xs tracking-wide" data-testid="mobile-badge">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              <span className="text-zinc-300">Mobile · v{meta?.version || "—"}</span>
              {installed ? <span className="text-emerald-400 font-semibold">· Installed ✓</span> : null}
            </div>
            <h2 className="font-display font-black text-4xl sm:text-5xl leading-[1.05] tracking-tight mt-6" data-testid="mobile-title">
              Arcstone, in<br/>your pocket.
            </h2>
            <p className="text-lg text-zinc-400 max-w-md mt-6 leading-relaxed" data-testid="mobile-sub">
              Install Arcstone on your phone in <b className="text-white">10 seconds</b> — no Play Store wait, no APK sideloading. Works fully offline for the last 7 days.
            </p>
            <ul className="mt-8 space-y-2 text-sm text-zinc-300" data-testid="mobile-feature-list">
              {(meta?.release_notes || []).map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle size={16} weight="fill" className="text-emerald-400 mt-0.5 flex-none"/>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <div className="mt-10 pt-6 border-t border-zinc-800 text-xs text-zinc-500 flex items-start gap-2">
              <Info size={14} className="mt-0.5 flex-none"/>
              <span>Need help? Email <a href={`mailto:${meta?.support_email || "support@arcstone.io"}`} className="text-zinc-300 underline">{meta?.support_email || "support@arcstone.io"}</a> with your work email and we will set up your account before you install.</span>
            </div>
          </div>

          {/* Right — download cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Android card */}
            <article className="border border-zinc-800 rounded-2xl p-6 bg-zinc-900/60 backdrop-blur-sm hover:bg-zinc-900 transition-colors" data-testid="mobile-android-card">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><AndroidLogo size={22} weight="fill"/></div>
                <div>
                  <h3 className="font-display font-bold text-lg">Android</h3>
                  <p className="text-xs text-zinc-500">{meta?.android?.min_android || "Android 8.0+"}{apkAvailable && meta?.android?.apk_size_mb ? ` · ${meta.android.apk_size_mb} MB APK` : " · Install as web app"}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 mb-5">
                <img src={qrApk} alt="Scan to install on Android" className="w-28 h-28 rounded bg-white p-1.5 flex-none" data-testid="qr-android"/>
                <div className="flex-1 text-xs text-zinc-400 leading-relaxed">
                  Scan the QR with your phone camera to open the install page on your Android device.
                </div>
              </div>

              {apkAvailable ? (
                <a href={apkUrl} className="block" data-testid="mobile-android-download">
                  <Button className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-lg gap-2"><DownloadSimple size={16} weight="bold"/>Download APK</Button>
                </a>
              ) : (
                <Button onClick={triggerInstall} disabled={installed}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-lg gap-2 disabled:opacity-60"
                  data-testid="mobile-install-pwa">
                  <DownloadSimple size={16} weight="bold"/>{installed ? "Installed on this device" : "Install Arcstone app"}
                </Button>
              )}

              {meta?.android?.play_store_url ? (
                <a href={meta.android.play_store_url} target="_blank" rel="noreferrer" className="block mt-2" data-testid="mobile-playstore">
                  <Button variant="outline" className="w-full bg-zinc-950 border-zinc-700 text-white hover:bg-zinc-800 rounded-lg gap-2"><ArrowUpRight size={14}/>Get on Play Store</Button>
                </a>
              ) : (
                <div className="mt-2 text-[11px] text-zinc-500 text-center">Native APK + Play Store listing — coming Q3</div>
              )}

              <details className="mt-5 text-xs text-zinc-400" data-testid="mobile-android-instructions">
                <summary className="cursor-pointer font-semibold text-zinc-300 hover:text-white">Installation steps ↓</summary>
                <ol className="list-decimal list-inside space-y-1.5 mt-2.5 leading-relaxed">
                  <li>On your Android phone, scan the QR above with the camera, OR open this page in <b>Chrome</b> on the phone.</li>
                  <li>Tap <b>Install Arcstone app</b>. Chrome shows a confirmation banner.</li>
                  <li>Tap <b>Install</b> in the banner — Arcstone is added to your home screen with a custom icon.</li>
                  <li>Open it from the home screen — runs in its own window without browser bars, just like a native app.</li>
                  <li>Sign in with the work email + temporary password your HR shared. Camera + location are requested when you check in.</li>
                  <li className="text-zinc-500"><i>Tip:</i> if "Install app" doesn't appear, open Chrome's <b>⋮ menu → Install app / Add to Home screen</b>.</li>
                </ol>
              </details>
            </article>

            {/* iOS card */}
            <article className="border border-zinc-800 rounded-2xl p-6 bg-zinc-900/60 backdrop-blur-sm hover:bg-zinc-900 transition-colors" data-testid="mobile-ios-card">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center"><AppleLogo size={22} weight="fill"/></div>
                <div>
                  <h3 className="font-display font-bold text-lg">iOS</h3>
                  <p className="text-xs text-zinc-500">{meta?.ios?.min_ios ? `iOS ${meta.ios.min_ios}+` : "iOS 14+"} · Add to Home Screen</p>
                </div>
              </div>

              <div className="flex items-start gap-4 mb-5">
                <img src={qrIos} alt="Scan to install on iOS" className="w-28 h-28 rounded bg-white p-1.5 flex-none" data-testid="qr-ios"/>
                <div className="flex-1 text-xs text-zinc-400 leading-relaxed">
                  Scan with your iPhone camera, then tap <b>Share → Add to Home Screen</b> in Safari.
                </div>
              </div>

              <Button onClick={() => setIosHelp(true)}
                className="w-full bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-lg gap-2"
                data-testid="mobile-ios-help">
                <DeviceMobile size={16} weight="bold"/>Show install steps
              </Button>

              <div className="mt-2 text-[11px] text-zinc-500 text-center">App Store listing — in review</div>

              <details className="mt-5 text-xs text-zinc-400" data-testid="mobile-ios-instructions">
                <summary className="cursor-pointer font-semibold text-zinc-300 hover:text-white">Installation steps ↓</summary>
                <ol className="list-decimal list-inside space-y-1.5 mt-2.5 leading-relaxed">
                  <li>Open this page in <b>Safari</b> on your iPhone (Chrome on iOS doesn't support PWA install).</li>
                  <li>Tap the <b>Share</b> button in the bottom toolbar (the square with an arrow).</li>
                  <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                  <li>Tap <b>Add</b> in the top-right. Arcstone now appears as an app on your home screen.</li>
                  <li>Open it from the home screen — runs without Safari UI, behaves like a native app.</li>
                  <li>Sign in with your work email and temporary password.</li>
                </ol>
              </details>
            </article>
          </div>
        </div>

        {/* iOS help overlay */}
        {iosHelp ? (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() => setIosHelp(false)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full text-white" onClick={(e) => e.stopPropagation()} data-testid="ios-help-modal">
              <h3 className="font-display font-bold text-xl mb-4 flex items-center gap-2"><AppleLogo size={20} weight="fill"/> Install on iPhone</h3>
              <ol className="space-y-3 text-sm">
                <li><b>1.</b> Open this page in <b>Safari</b> on your iPhone (URL: <code className="text-xs bg-zinc-800 px-1 rounded">{typeof window !== "undefined" ? window.location.host : ""}</code>).</li>
                <li><b>2.</b> Tap the <b>Share</b> icon (square with up-arrow) at the bottom of Safari.</li>
                <li><b>3.</b> Scroll and tap <b>"Add to Home Screen"</b>.</li>
                <li><b>4.</b> Tap <b>Add</b> in the top-right corner. Done!</li>
              </ol>
              <Button className="w-full mt-6 bg-zinc-800 hover:bg-zinc-700" onClick={() => setIosHelp(false)} data-testid="ios-help-close">Got it</Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
