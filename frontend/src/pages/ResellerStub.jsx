import AppShell, { SectionCard } from "../components/AppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Link } from "react-router-dom";
import { CurrencyInr, Receipt, ChartBar, Sparkle } from "@phosphor-icons/react";

const COPY = {
  commissions: {
    title: "Commission earnings",
    icon: CurrencyInr,
    description: "Live commission ledger with per-tenant breakdown, monthly payouts, and CSV export.",
    bullets: [
      "Per-company commission line items by plan & month",
      "Auto-payout history (NEFT/wire) with reference numbers",
      "Year-to-date commission report (PDF + CSV)",
    ],
  },
  billing: {
    title: "Billing & invoices",
    icon: Receipt,
    description: "Self-serve invoice center: download GST-compliant invoices, view next due date, manage card on file.",
    bullets: [
      "Tenant-level invoices with PDF download",
      "Stripe-managed subscription & card on file",
      "Automatic dunning for failed payments",
    ],
  },
  pricing: {
    title: "Wholesale pricing",
    icon: ChartBar,
    description: "Configure your retail markup over wholesale rates per plan & module so you control your margin.",
    bullets: [
      "Wholesale → retail markup matrix per plan",
      "Per-module add-on pricing with seat tiers",
      "Currency override (INR/USD/AED) for cross-border resellers",
    ],
  },
};

export default function ResellerStub({ kind = "commissions" }) {
  const cfg = COPY[kind] || COPY.commissions;
  const Icon = cfg.icon;

  return (
    <AppShell title={cfg.title}>
      <div className="space-y-5" data-testid={`reseller-stub-${kind}`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold tracking-tight">{cfg.title}</h2>
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 uppercase text-[10px] tracking-wider" data-testid="stub-coming-soon">
                <Sparkle size={11} className="mr-1" weight="fill"/>Coming soon
              </Badge>
            </div>
            <p className="text-sm text-zinc-500 mt-1 max-w-2xl">{cfg.description}</p>
          </div>
        </div>

        <SectionCard title="What's planned" subtitle="Targeted for the next reseller release after Stripe billing goes live." testid="stub-planned">
          <ul className="space-y-2 text-sm">
            {cfg.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-900 mt-1.5 flex-none"/>
                <span className="text-zinc-700">{b}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="In the meantime" subtitle="Use the overview & companies list to manage your tenants." testid="stub-actions">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/app/reseller"><Button size="sm" variant="outline" data-testid="stub-overview-link">Reseller overview</Button></Link>
            <Link to="/app/companies"><Button size="sm" className="bg-zinc-950 hover:bg-zinc-800" data-testid="stub-companies-link">My companies</Button></Link>
          </div>
        </SectionCard>

        <div className="flex items-center gap-2 text-zinc-400">
          <Icon size={14}/>
          <span className="text-[11px] uppercase tracking-wider">{kind}</span>
        </div>
      </div>
    </AppShell>
  );
}
