import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Play, Menu, X as CloseIcon, Plus,
  Percent, Palette, Rocket, LifeBuoy, Layers, ShieldCheck,
  Vault, MapPin, Scale, Banknote, Smartphone, Check, X as XMark,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────── */

const STATS = [
  { n: "251",   l: "API endpoints" },
  { n: "12",    l: "States · PT compliance" },
  { n: "4-tier", l: "Multi-tenancy" },
  { n: "76",    l: "Passing tests" },
];

const DOORS = [
  {
    no: "01", cat: "FOR PARTNERS",
    h: "You sell HR services, recruitment, or compliance.",
    p: "Turn every client relationship into a recurring HRMS license. White-label Arcstone on your own domain, set your own retail price, keep 30–40% of every dollar — paid monthly. We handle the product. You keep the customer.",
    href: "#partners",
  },
  {
    no: "02", cat: "FOR MULTI-BRANCH",
    h: "Your HRMS treats Mumbai HQ and your Patna branch the same.",
    p: "We don't. Branches are first-class operating units in Arcstone — each with its own ledger, petty cash, vendor catalog, geofenced attendance, and statutory PT for the state it operates in. Roll-up to HQ at month-end is automatic.",
    href: "#branches",
  },
  {
    no: "03", cat: "FOR FINANCE-LED CFOs",
    h: "Most HRMS tools tell you who to pay.",
    p: "Arcstone tells you whether you can afford to. Our Budget Pre-flight engine sits between every HR transaction and the bank — payroll runs, expense claims, hiring requests — and blocks anything that would breach a branch or department envelope. HR meets Finance, not at month-end.",
    href: "#pricing",
  },
];

const PARTNER_BENEFITS = [
  { Icon: Percent,     h: "Recurring margin",    p: "30–40% on every license, paid monthly." },
  { Icon: Palette,     h: "Your brand",          p: "Your domain, logo, customers; we're invisible." },
  { Icon: Rocket,      h: "Live in 14 days",     p: "Onboarding, training, sales collateral, co-marketing budget." },
  { Icon: LifeBuoy,    h: "Tier-1 support",      p: "Dedicated partner success manager." },
  { Icon: Layers,      h: "Module gating",       p: "Sell only what the client needs; add later." },
  { Icon: ShieldCheck, h: "Data isolation",      p: "Tenant separation enforced at the query layer." },
];

const BRANCH_FEATURES = [
  { Icon: Vault,      h: "Branch Vault",                     p: "Each branch its own ledger; petty cash, recurring vendors, local approvals; rolled up to HQ at month-end." },
  { Icon: MapPin,     h: "Geofenced selfie check-in",        p: "Field staff, drivers, technicians, retail floor; works offline, syncs on reconnect." },
  { Icon: Scale,      h: "Statutory PT — 12 states",         p: "MH · KA · TN · WB · GJ · TS · AP · KL · OD · MP · AS · BR. Slabs auto-applied per branch's registered state." },
  { Icon: Banknote,   h: "Branch-level budgets",             p: "Hiring caps, expense ceilings, recurring spend per branch; Budget Pre-flight blocks payroll runs that exceed limits." },
  { Icon: Smartphone, h: "Native mobile · 13 screens",       p: "Built on Expo, live on Play Store, transactional not viewer." },
];

const PILLARS = [
  ["01", "Core HR",                "Directory, Org Chart, Hierarchy Map, Onboarding & Offboarding, Joining Kit, HR Alerts."],
  ["02", "Time & Attendance",      "Geofenced check-in, Comp-Off, Live Tracking, Shift Roster, Holidays."],
  ["03", "Payroll & Compensation", "12-state PT, Investment Declarations, F&F, Loans, Insurance, Compensation."],
  ["04", "Finance Operations",     "Branch Vault, Recurring, Budgets, Pre-flight Engine. The new pillar."],
  ["05", "Procurement & Vendors",  "Vendors, RFQs, POs, Vendor Portal, Categories, Service Requests."],
  ["06", "Performance & Growth",   "Goals/OKRs, Reviews, Cycles, 9-Box, PIPs, Compensation Reviews."],
  ["07", "Compliance & Engagement","PoSH, Helpdesk, Policies (12 seeded), Letters (12 templates), KB."],
  ["08", "Platform & Reseller",    "4-tier multi-tenancy, Module gating, Reseller billing, White-label."],
  ["09", "Native Mobile",          "13 screens. Expo. Offline-first. On Play Store. iOS Q2."],
];

const DIFF_ROWS = [
  ["Reseller channel · native",          "Built-in",        "—",          "—",          "—"],
  ["White-label / partner branding",     "Full",            "—",          "—",          "—"],
  ["4-tier multi-tenancy",               "Query-enforced",  "2-tier",     "2-tier",     "2-tier"],
  ["Branch as operating unit",           "First-class",     "Cost center","Limited",    "Cost center"],
  ["Multi-state PT (12 states)",         "Yes",             "Partial",    "Yes",        "Yes"],
  ["Budget Pre-flight (HR↔Finance)",     "Native",          "—",          "—",          "Limited"],
  ["Native transactional mobile",        "13 screens",      "Yes",        "Viewer only","Yes"],
  ["Procurement + Vendors built-in",     "Yes",             "—",          "—",          "—"],
];

const PRICING = [
  {
    tier: "Starter", price: "₹49", per: "/emp/mo", popular: false,
    blurb: "Teams of 10–100",
    features: ["Core HR + Org chart", "Attendance + Leave", "Payroll (single state)", "Native mobile"],
    cta: { label: "Start trial", href: "/signup", variant: "ghost" },
  },
  {
    tier: "Growth", price: "₹99", per: "/emp/mo", popular: true,
    blurb: "Teams of 100–500",
    features: ["Everything in Starter", "Multi-state payroll (12)", "Multi-branch operations", "Performance + Reviews", "Procurement + Travel"],
    cta: { label: "Book demo", href: "#demo", variant: "primary" },
  },
  {
    tier: "Pro", price: "₹199", per: "/emp/mo", popular: false,
    blurb: "Teams of 500+",
    features: ["Everything in Growth", "Budget Pre-flight", "Branch Vault + Recurring", "Custom workflows", "SSO + Audit log + DPDP pack"],
    cta: { label: "Book demo", href: "#demo", variant: "ghost" },
  },
  {
    tier: "Partner", price: "Custom", per: "", popular: false,
    blurb: "Resellers · MSPs · CAs",
    features: ["White-label instance", "Reseller billing layer", "30–40% recurring margin", "Co-marketing budget", "Partner success manager"],
    cta: { label: "Apply", href: "#partners", variant: "primary" },
  },
];

const FAQ = [
  {
    q: "How long does setup actually take?",
    a: "14 days for direct customers — data migration, payroll history import, statutory config, training. Channel partners go live in 7 days via master template replication.",
  },
  {
    q: "Do you handle Indian statutory compliance fully?",
    a: "PT for 12 states, PF, ESI, professional tax, TDS, gratuity, F&F all built in. Slab changes tracked via maintained policy engine. Compliance updates ship same day.",
  },
  {
    q: "Can I migrate from Keka, GreytHR, or Zoho People?",
    a: "Yes. Free migration on annual plans. We handle employee master, payroll history (24 months), leave balances, asset register. Average migration: 5 working days.",
  },
  {
    q: "How does the partner program actually work?",
    a: "Apply, vet, approve. Approved partners get a white-labeled instance on their own subdomain (or custom domain), training certification, sales playbook, and a dedicated success manager. You sell at your price; we bill wholesale; margin 30–40% recurring.",
  },
  {
    q: "Where is data hosted? Are you DPDP-compliant?",
    a: "Hetzner Frankfurt with daily MongoDB backups and HTTPS. India hosting available for enterprise on request. DPDP pack ships Q2; SOC 2 Type 1 audit underway.",
  },
  {
    q: "Is the mobile app actually transactional?",
    a: "Yes. 13 native screens on Expo / React Native. Apply leave, approve requests, file claims, geofenced check-in with selfie, view payslip, raise tickets. Offline-first; syncs on reconnect. Live on Play Store; iOS Q2.",
  },
];

/* ─────────────────────────────────────────────────────────────────────────── */

export default function Landing() {
  // Smooth-scroll affordance + arcstone-page class for HTML root
  useEffect(() => {
    document.documentElement.classList.add("arcstone-page");
    return () => document.documentElement.classList.remove("arcstone-page");
  }, []);

  return (
    <div className="arcstone-marketing arcstone-bg-effects" data-testid="landing-root">
      <Nav/>
      <Hero/>
      <ThreeDoors/>
      <PartnersSection/>
      <BranchesSection/>
      <PillarsSection/>
      <DiffTable/>
      <PricingSection/>
      <FAQSection/>
      <FinalCTA/>
      <Footer/>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* NAV                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="arcstone-nav sticky top-0 z-50" data-testid="landing-nav">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5" data-testid="landing-logo">
          <div className="w-7 h-7 rounded-md flex items-center justify-center font-display font-black text-sm" style={{ background: "var(--amber)", color: "#1a1208" }}>A</div>
          <div className="font-display font-semibold text-base tracking-tight">Arcstone</div>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-sm" style={{ color: "var(--cream-dim)" }}>
          <a href="#partners"  className="hover:text-[color:var(--cream)] transition-colors" data-testid="nav-partners">Partners</a>
          <a href="#product"   className="hover:text-[color:var(--cream)] transition-colors" data-testid="nav-product">Product</a>
          <a href="#branches"  className="hover:text-[color:var(--cream)] transition-colors" data-testid="nav-branches">Branches</a>
          <a href="#pricing"   className="hover:text-[color:var(--cream)] transition-colors" data-testid="nav-pricing">Pricing</a>
          <a href="#faq"       className="hover:text-[color:var(--cream)] transition-colors" data-testid="nav-faq">FAQ</a>
        </nav>
        <div className="hidden md:flex items-center gap-2.5">
          <Link to="/login" className="arcstone-btn-ghost text-sm" data-testid="nav-signin">Sign in</Link>
          <a href="#partners" className="arcstone-btn-primary text-sm" data-testid="nav-become-partner">
            Become a partner <ArrowRight size={14}/>
          </a>
        </div>
        <button className="md:hidden text-[color:var(--cream)]" onClick={() => setOpen(o => !o)} data-testid="nav-mobile-toggle" aria-label="Open menu">
          {open ? <CloseIcon size={20}/> : <Menu size={20}/>}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t" style={{ borderColor: "var(--line)" }} data-testid="nav-mobile-panel">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-4 text-sm">
            {["partners", "product", "branches", "pricing", "faq"].map(k => (
              <a key={k} href={`#${k}`} className="capitalize" style={{ color: "var(--cream-dim)" }} onClick={() => setOpen(false)}>{k}</a>
            ))}
            <Link to="/login" className="arcstone-btn-ghost text-center" onClick={() => setOpen(false)}>Sign in</Link>
            <a href="#partners" className="arcstone-btn-primary justify-center" onClick={() => setOpen(false)}>Become a partner <ArrowRight size={14}/></a>
          </div>
        </div>
      )}
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* HERO                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section id="top" className="relative pt-24 pb-28 sm:pt-32 sm:pb-40 overflow-hidden" data-testid="hero">
      <div className="arcstone-blade hidden lg:block" style={{ left: "15%", top: 0, height: "70%" }}/>
      <div className="arcstone-blade hidden lg:block" style={{ right: "12%", top: "8%", height: "55%" }}/>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative">
        <div className="arcstone-rise" style={{ animationDelay: "0ms" }}>
          <span className="arcstone-pill" data-testid="hero-pill">
            <span className="dot"/>LIVE · 251 ENDPOINTS · 12 STATES · 9 PILLARS
          </span>
        </div>

        <h1 className="font-display font-semibold mt-7 sm:mt-9 text-5xl sm:text-6xl lg:text-7xl xl:text-[88px] leading-[1.02] tracking-tight max-w-5xl arcstone-rise"
            style={{ animationDelay: "120ms" }} data-testid="hero-h1">
          The HRMS built for India's <span className="italic" style={{ color: "var(--amber)" }}>branches</span>
          <span className="block" style={{ color: "rgba(245,240,230,0.55)" }}>— and the partners who serve them.</span>
        </h1>

        <p className="mt-7 sm:mt-9 text-lg sm:text-xl leading-relaxed max-w-2xl arcstone-rise"
           style={{ color: "var(--cream-dim)", animationDelay: "260ms" }} data-testid="hero-sub">
          Arcstone is the only HRMS with a built-in reseller channel. Recruitment firms, HR consultancies, payroll bureaus, and staffing companies white-label it as their own product — or run it direct across your 5, 50, or 500 branches with multi-state payroll, geofenced attendance, and finance-aware budgets.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3 arcstone-rise" style={{ animationDelay: "400ms" }}>
          <a href="#partners" className="arcstone-btn-primary" data-testid="hero-cta-primary">
            Become a partner <ArrowRight size={16}/>
          </a>
          <a href="#demo" className="arcstone-btn-ghost" data-testid="hero-cta-ghost">
            <Play size={14}/> See it in 5 minutes
          </a>
        </div>

        <div className="mt-20 sm:mt-24 grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-10 arcstone-rise" style={{ animationDelay: "560ms" }} data-testid="hero-stats">
          {STATS.map(s => (
            <div key={s.l} className="arcstone-stat">
              <div className="font-display font-medium text-4xl sm:text-5xl tracking-tight" style={{ color: "var(--cream)" }}>{s.n}</div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] mt-2" style={{ color: "var(--cream-dim)" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* THREE DOORS                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */
function ThreeDoors() {
  return (
    <section id="product" className="py-24 sm:py-32 relative" data-testid="three-doors">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="eyebrow">The three doors in</div>
        <h2 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-4 max-w-3xl">
          Three audiences. One <span className="italic" style={{ color: "var(--amber)" }}>product</span>.
        </h2>
        <p className="mt-6 text-base sm:text-lg max-w-2xl" style={{ color: "var(--cream-dim)" }}>
          We didn't build Arcstone to fight Keka in 50-floor towers. We built it for the Indian SMB universe Keka leaves on the table — and the consultants who serve them.
        </p>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
          {DOORS.map((d, i) => (
            <Card key={d.no} className="p-7 sm:p-8 flex flex-col" testid={`door-${i + 1}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs" style={{ color: "var(--amber)" }}>{d.no}</span>
                <span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: "var(--cream-dim)" }}>{d.cat}</span>
              </div>
              <h3 className="font-display font-medium text-2xl mt-6 leading-snug">{d.h}</h3>
              <p className="mt-4 text-sm leading-relaxed flex-1" style={{ color: "var(--cream-dim)" }}>{d.p}</p>
              <a href={d.href} className="mt-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] group" style={{ color: "var(--amber)" }}>
                See more <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5"/>
              </a>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* PARTNERS                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
function PartnersSection() {
  return (
    <section id="partners" className="arcstone-section-tint py-28 sm:py-36" data-testid="partners-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
        <div className="lg:col-span-5">
          <div className="eyebrow">The channel program</div>
          <h2 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-4 leading-[1.05]">
            Built so your consultant <span className="italic" style={{ color: "var(--amber)" }}>can sell it.</span>
          </h2>
          <div className="mt-7 space-y-5 text-base sm:text-lg leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            <p>
              India has 200,000+ HR firms, recruitment agencies, payroll bureaus, and consultancies. Every one of them already has SMB clients asking for HR software. None of them have a product they can call their own.
            </p>
            <p>
              Arcstone's 4-tier multi-tenancy was built day one for this. <span className="font-mono text-sm" style={{ color: "var(--cream)" }}>Platform → Reseller → Company → Org.</span> Every partner gets their own white-labeled instance, their own pricing shelf, and their own customer list — invisible to us, billable monthly.
            </p>
          </div>
          <a href="mailto:partners@arcstone.co.in" className="arcstone-btn-primary mt-9" data-testid="partners-apply-cta">
            Apply to become a partner <ArrowRight size={16}/>
          </a>
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PARTNER_BENEFITS.map(({ Icon, h, p }, i) => (
            <Card key={h} className="p-6" testid={`partner-benefit-${i + 1}`}>
              <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: "rgba(232,163,65,0.12)" }}>
                <Icon size={16} strokeWidth={1.6} style={{ color: "var(--amber)" }} aria-hidden/>
              </div>
              <h4 className="font-display font-medium text-lg mt-5">{h}</h4>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--cream-dim)" }}>{p}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* BRANCHES                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
function BranchesSection() {
  return (
    <section id="branches" className="py-28 sm:py-36" data-testid="branches-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
        <div className="lg:col-span-5 lg:sticky lg:top-32 lg:self-start">
          <div className="eyebrow">Built for distributed teams</div>
          <h2 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-4 leading-[1.05]">
            Every branch.<br/>Every shift.<br/><span className="italic" style={{ color: "var(--amber)" }}>Every state.</span>
          </h2>
          <p className="mt-7 text-base sm:text-lg leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            For retail chains, NBFCs, hospital groups, manufacturing plants, schools, and logistics companies running operations across the country.
          </p>
        </div>
        <div className="lg:col-span-7 space-y-4">
          {BRANCH_FEATURES.map(({ Icon, h, p }, i) => (
            <Card key={h} className="p-6 sm:p-7 flex gap-5" testid={`branch-feature-${i + 1}`}>
              <div className="w-11 h-11 rounded-md flex items-center justify-center flex-none" style={{ background: "rgba(232,163,65,0.1)" }}>
                <Icon size={18} strokeWidth={1.6} style={{ color: "var(--amber)" }} aria-hidden/>
              </div>
              <div className="min-w-0">
                <h4 className="font-display font-medium text-xl">{h}</h4>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--cream-dim)" }}>{p}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* PILLARS                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */
function PillarsSection() {
  return (
    <section className="arcstone-section-tint py-28 sm:py-36" data-testid="pillars-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="eyebrow">9 pillars · live</div>
        <h2 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-4">
          Built, not <span className="italic" style={{ color: "var(--amber)" }}>promised</span>.
        </h2>
        <p className="mt-6 text-base sm:text-lg max-w-2xl" style={{ color: "var(--cream-dim)" }}>
          251 API endpoints, 51 backend routers, 75 MongoDB collections, 46,600 lines of production code. Live on Hetzner Frankfurt. Backed up daily.
        </p>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PILLARS.map(([no, h, p], i) => (
            <Card key={no} className="p-6" testid={`pillar-${no}`}>
              <div className="font-mono text-xs" style={{ color: "var(--amber)" }}>{no}</div>
              <h4 className="font-display font-medium text-2xl mt-4">{h}</h4>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--cream-dim)" }}>{p}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* DIFFERENTIATION TABLE                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */
function DiffTable() {
  const renderCell = (val, isArc) => {
    if (val === "—") return <XMark size={14} style={{ color: "rgba(245,240,230,0.4)" }} aria-label="no"/>;
    if (val === "Yes" || val === "Built-in" || val === "Full" || val === "Native" || val === "First-class" || val === "Query-enforced") {
      return (
        <span className="inline-flex items-center gap-1.5">
          <Check size={14} style={{ color: isArc ? "var(--amber)" : "rgba(245,240,230,0.7)" }} aria-label="yes"/>
          <span>{val}</span>
        </span>
      );
    }
    return <span style={{ color: "var(--cream-dim)" }}>{val}</span>;
  };
  return (
    <section className="py-28 sm:py-36" data-testid="diff-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="eyebrow">Vs. the category</div>
        <h2 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-4">
          Where we're <span className="italic" style={{ color: "var(--amber)" }}>structurally</span> different.
        </h2>
        <p className="mt-6 text-base sm:text-lg max-w-2xl" style={{ color: "var(--cream-dim)" }}>
          Not a feature war. These are architectural choices made on day one. Hard to copy without a rewrite.
        </p>

        <div className="mt-12 overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
          <table className="arcstone-table w-full min-w-[760px]">
            <thead>
              <tr>
                <th>Capability</th>
                <th className="col-arcstone-head">Arcstone</th>
                <th>Keka</th>
                <th>GreytHR</th>
                <th>Darwinbox</th>
              </tr>
            </thead>
            <tbody>
              {DIFF_ROWS.map((row, i) => (
                <tr key={i} data-testid={`diff-row-${i}`}>
                  <td style={{ color: "var(--cream)" }}>{row[0]}</td>
                  <td className="col-arcstone">{renderCell(row[1], true)}</td>
                  <td>{renderCell(row[2], false)}</td>
                  <td>{renderCell(row[3], false)}</td>
                  <td>{renderCell(row[4], false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* PRICING                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */
function PricingSection() {
  return (
    <section id="pricing" className="arcstone-section-tint py-28 sm:py-36" data-testid="pricing-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="eyebrow">Pricing</div>
        <h2 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-4 max-w-3xl">
          Public. Predictable. <span className="italic" style={{ color: "var(--amber)" }}>No 'contact sales'</span>.
        </h2>
        <p className="mt-6 text-base sm:text-lg max-w-2xl" style={{ color: "var(--cream-dim)" }}>
          Per-employee, per-month, billed annually. No setup fees on Starter and Growth. Migration is free with annual plans.
        </p>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRICING.map((p, i) => {
            const isPrimary = p.cta.variant === "primary";
            const Comp = p.cta.href.startsWith("/") ? Link : "a";
            const compProps = p.cta.href.startsWith("/") ? { to: p.cta.href } : { href: p.cta.href };
            return (
              <Card key={p.tier}
                className={`p-7 flex flex-col ${p.popular ? "ring-1" : ""}`}
                style={p.popular ? { borderColor: "rgba(232,163,65,0.5)" } : undefined}
                testid={`pricing-${p.tier.toLowerCase()}`}>
                {p.popular && (
                  <div className="self-start font-mono text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded-md mb-4"
                       style={{ background: "var(--amber)", color: "#1a1208" }} data-testid="pricing-badge-popular">
                    Most popular
                  </div>
                )}
                <h3 className="font-display font-medium text-2xl">{p.tier}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display font-semibold text-4xl tracking-tight">{p.price}</span>
                  {p.per && <span className="font-mono text-xs" style={{ color: "var(--cream-dim)" }}>{p.per}</span>}
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] mt-3" style={{ color: "var(--cream-dim)" }}>{p.blurb}</div>
                <ul className="mt-6 space-y-2.5 text-sm leading-relaxed flex-1" style={{ color: "var(--cream-dim)" }}>
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={14} strokeWidth={2} className="mt-0.5 flex-none" style={{ color: "var(--amber)" }} aria-hidden/>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Comp {...compProps} className={`mt-7 ${isPrimary ? "arcstone-btn-primary" : "arcstone-btn-ghost"} justify-center`} data-testid={`pricing-cta-${p.tier.toLowerCase()}`}>
                  {p.cta.label} {isPrimary && <ArrowRight size={14}/>}
                </Comp>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* FAQ                                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
function FAQSection() {
  return (
    <section id="faq" className="py-28 sm:py-36" data-testid="faq-section">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        <div className="eyebrow">FAQ</div>
        <h2 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-4">
          The <span className="italic" style={{ color: "var(--amber)" }}>honest</span> answers.
        </h2>

        <div className="mt-12 space-y-3">
          {FAQ.map((f, i) => (
            <details key={i} className="arcstone-faq arcstone-card p-5 sm:p-6" data-testid={`faq-${i + 1}`}>
              <summary className="flex items-center justify-between gap-4">
                <span className="font-display font-medium text-lg sm:text-xl pr-4">{f.q}</span>
                <span className="plus flex-none w-7 h-7 rounded-md flex items-center justify-center" style={{ border: "1px solid var(--line-2)" }}>
                  <Plus size={14} style={{ color: "var(--cream)" }}/>
                </span>
              </summary>
              <p className="mt-4 text-sm sm:text-base leading-relaxed" style={{ color: "var(--cream-dim)" }}>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* FINAL CTA                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section id="demo" className="relative py-28 sm:py-36 text-center overflow-hidden" data-testid="final-cta">
      <div aria-hidden className="pointer-events-none absolute inset-0"
           style={{ background: "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(232,163,65,0.08), transparent 60%)" }}/>
      <div className="max-w-3xl mx-auto px-6 lg:px-8 relative">
        <div className="eyebrow">5 minutes. No deck.</div>
        <h2 className="font-display font-semibold text-4xl sm:text-5xl lg:text-7xl tracking-tight mt-5 leading-[1.05]">
          We'd rather <span className="italic" style={{ color: "var(--amber)" }}>show</span> you<br/>than tell you.
        </h2>
        <p className="mt-7 text-base sm:text-lg leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          A live walkthrough from <span className="font-mono text-sm px-1.5 py-0.5 rounded" style={{ background: "rgba(232,163,65,0.1)", color: "var(--cream)" }}>hr@acme.io</span> login through the Budget Pre-flight engine to the off-roll consultant's mobile app reshuffling in real time. Five steps, five minutes, one wow.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a href="mailto:hello@arcstone.co.in?subject=Demo%20request" className="arcstone-btn-primary text-base px-6 py-3.5" data-testid="final-cta-demo">
            Book a demo <ArrowRight size={16}/>
          </a>
          <a href="#partners" className="arcstone-btn-ghost text-base px-6 py-3.5" data-testid="final-cta-partner">
            Become a partner
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* FOOTER                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="border-t pt-16 pb-10" style={{ borderColor: "var(--line)" }} data-testid="landing-footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
        <div className="col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md flex items-center justify-center font-display font-black text-sm" style={{ background: "var(--amber)", color: "#1a1208" }}>A</div>
            <div className="font-display font-semibold text-base">Arcstone</div>
          </div>
          <p className="font-mono text-xs leading-relaxed mt-5 max-w-xs" style={{ color: "var(--cream-dim)" }}>
            HR for India's branches and the partners who serve them.
          </p>
        </div>
        <FooterCol title="Product" links={[
          ["Modules", "#product"], ["Multi-branch", "#branches"], ["Pricing", "#pricing"], ["Mobile app", "#branches"],
        ]}/>
        <FooterCol title="Partners" links={[
          ["Become a partner", "#partners"], ["Partner login", "/login"], ["Reseller program", "#partners"],
        ]}/>
        <FooterCol title="Company" links={[
          ["About", "#"], ["Trust & Security", "#"], ["Contact", "mailto:hello@arcstone.co.in"],
        ]}/>
      </div>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 mt-14 pt-7 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-[11px] tracking-[0.1em]"
           style={{ borderColor: "var(--line)", color: "var(--cream-dim)" }}>
        <div>© 2026 Arcstone Technologies. Made in India.</div>
        <div>Hosted on Hetzner · DPDP-ready Q2</div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: "var(--cream)" }}>{title}</div>
      <ul className="mt-5 space-y-2.5 font-mono text-xs">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("/") ? (
              <Link to={href} className="hover:text-[color:var(--cream)] transition-colors" style={{ color: "var(--cream-dim)" }}>{label}</Link>
            ) : (
              <a href={href} className="hover:text-[color:var(--cream)] transition-colors" style={{ color: "var(--cream-dim)" }}>{label}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* CARD with cursor-tracking glow                                             */
/* ─────────────────────────────────────────────────────────────────────────── */
function Card({ children, className = "", style, testid }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={onMove} className={`arcstone-card ${className}`} style={style} data-testid={testid}>
      {children}
    </div>
  );
}
