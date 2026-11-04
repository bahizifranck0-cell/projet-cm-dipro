import Link from "next/link";
import { requirePage } from "@/server/auth/current";
import { financialSummary, listLedger, periodBounds } from "@/server/services/finance";
import { fmtMoney } from "@/server/services/billing";
import { Card, PageHeader, StatCard } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Finance" };
const TYPE = { REVENUE: "Recette", EXPENSE: "Dépense", REVERSAL: "Extourne" } as const;
export default async function Page({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const actor = await requirePage("finance", "view");
  const period = (await searchParams).periode ?? new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 7);
  const { from, to } = periodBounds(/^\d{4}-\d{2}$/.test(period) ? period : new Date().toISOString().slice(0, 7));
  const [sum, ledger] = await Promise.all([financialSummary(actor, from, to), listLedger(actor, from, to)]);
  return (<>
    <PageHeader title="Finance et comptabilité" subtitle={`Période ${period}`} actions={<>
      <Link href="/finance/depenses" className={buttonClass("secondary")}>Dépenses</Link>
      <Link href="/finance/journal" className={buttonClass("secondary")}>Journal de caisse</Link>
      <Link href="/credits" className={buttonClass("secondary")}>Dettes</Link>
      <Link href="/finance/parametres" className={buttonClass("ghost")}>Paramètres</Link></>} />
    <form className="mb-5 flex gap-2"><input type="month" name="periode" defaultValue={period} className="field !w-auto" aria-label="Période" /><button className={buttonClass("secondary")}>Afficher</button></form>
    {sum.map((s) => (
      <div key={s.currency} className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Recettes encaissées (${s.currency})`} value={fmtMoney(s.revenue, s.currency)} tone="green" />
        <StatCard label={`Dépenses payées (${s.currency})`} value={fmtMoney(s.expenses, s.currency)} tone="red" />
        <StatCard label={`Facturé (${s.currency})`} value={fmtMoney(s.invoiced, s.currency)} />
        <StatCard label={`Dettes ouvertes (${s.currency})`} value={fmtMoney(s.openDebts, s.currency)} tone="amber" hint="toutes périodes" />
      </div>
    ))}
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Journal des opérations</h2>
      {ledger.length === 0 ? <p className="text-sm text-muted">Aucune opération sur la période.</p> : (
        <ul className="divide-y divide-white/10 text-sm">{ledger.map((l) => (
          <li key={String(l.id)} className="grid gap-1 py-2 lg:grid-cols-[150px_100px_minmax(0,1fr)_140px]">
            <span className="text-muted">{fmtDateTime(l.at)}</span><span>{TYPE[l.type]}</span><span>{l.description}{l.department && <span className="text-muted"> · {l.department.name}</span>}</span>
            <span className={`font-semibold lg:text-right ${l.amount.lt(0) ? "text-[#ffd0d5]" : "text-success"}`}>{fmtMoney(l.amount, l.currency)}</span>
          </li>))}</ul>
      )}
      <p className="mt-3 text-xs text-muted">Journal en ajout seul : une correction se fait par extourne, jamais par suppression.</p>
    </Card>
  </>);
}
