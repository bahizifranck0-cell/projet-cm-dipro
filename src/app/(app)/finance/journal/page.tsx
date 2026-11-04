import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { redirect } from "next/navigation";
import { cashJournal } from "@/server/services/finance";
import { fmtMoney } from "@/server/services/billing";
import { displayName } from "@/server/services/patients";
import { db } from "@/server/db";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui/card";
import { ActionButton, BillingActions as A, SimpleForm } from "@/components/billing/billing-forms";
import { Field, Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Journal de caisse" };
export default async function Page({ searchParams }: { searchParams: Promise<{ du?: string; au?: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "cash", "view") && !can(actor, "finance", "view")) redirect("/acces-refuse");
  const sp = await searchParams;
  const today = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
  const du = sp.du ?? today, au = sp.au ?? today;
  const from = new Date(`${du}T00:00:00+02:00`), to = new Date(new Date(`${au}T00:00:00+02:00`).getTime() + 86400e3);
  const j = await cashJournal(actor, from, to, can(actor, "finance", "view") ? undefined : actor.userId);
  const recs = can(actor, "finance", "view") ? await db.cashReconciliation.findMany({ orderBy: { preparedAt: "desc" }, take: 24 }) : [];
  return (<div className="space-y-5">
    <PageHeader title="Journal de caisse" subtitle={can(actor, "finance", "view") ? "Toutes les caisses" : "Mes encaissements"} />
    <form className="flex flex-wrap items-end gap-2"><label className="block"><span className="mb-1 block text-sm">Du</span><input type="date" name="du" defaultValue={du} className="field" /></label><label className="block"><span className="mb-1 block text-sm">Au</span><input type="date" name="au" defaultValue={au} className="field" /></label><button className={buttonClass("secondary")}>Afficher</button></form>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard label="Total USD" value={fmtMoney(j.totals.USD ?? 0, "USD")} tone="green" />
      <StatCard label="Total CDF" value={fmtMoney(j.totals.CDF ?? 0, "CDF")} tone="green" />
      <StatCard label="Opérations" value={j.payments.length} />
    </div>
    <Card>{j.payments.length === 0 ? <p className="text-sm text-muted">Aucun encaissement.</p> : (
      <ul className="divide-y divide-white/10 text-sm">{j.payments.map((p) => (
        <li key={p.id} className="grid gap-1 py-2 xl:grid-cols-[150px_120px_minmax(0,1fr)_110px_130px]">
          <span className="text-muted">{fmtDateTime(p.receivedAt)}</span><span>{p.number}</span>
          <span>{p.invoice.number} — {p.invoice.patient ? displayName(p.invoice.patient) : p.invoice.sale?.customerName ?? "Vente"}{p.reversalOfId && <> <Badge tone="red">Extourne</Badge></>}</span>
          <span className="text-muted">{j.cashierName[p.cashierId]}</span><span className="font-semibold xl:text-right">{fmtMoney(p.amount, p.currency)}</span>
        </li>))}</ul>)}</Card>
    {can(actor, "finance", "view") && <Card>
      <h2 className="mb-3 text-lg font-semibold">Réconciliation mensuelle</h2>
      {can(actor, "finance", "create") && <SimpleForm action={A.reconciliationAction} submit="Enregistrer la réconciliation"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Mois *" name="period"><Input name="period" type="month" required defaultValue={today.slice(0, 7)} /></Field>
        <Field label="Devise" name="currency"><Select name="currency" defaultValue="USD"><option>USD</option><option>CDF</option></Select></Field>
        <Field label="Montant compté en caisse *" name="counted"><Input name="counted" required inputMode="decimal" /></Field>
        <Field label="Remarques" name="notes"><Input name="notes" /></Field></div>
        <p className="text-xs text-muted">Le montant attendu est calculé : encaissements en espèces du mois − dépenses payées.</p></SimpleForm>}
      <ul className="mt-4 divide-y divide-white/10 text-sm">{recs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-2"><span className="min-w-0 flex-1 break-words">{r.period} · {r.currency} · attendu {fmtMoney(r.expectedAmount, r.currency)} · compté {fmtMoney(r.countedAmount, r.currency)} · <strong>écart {fmtMoney(r.difference, r.currency)}</strong></span>
          <Badge tone={r.status === "APPROVED" ? "green" : "amber"}>{r.status === "APPROVED" ? "Validée" : "À valider"}</Badge>
          {r.status === "PENDING" && can(actor, "finance", "validate") && <ActionButton action={A.approveReconciliationAction.bind(null, r.id)} label="Valider" />}</li>))}</ul>
    </Card>}
  </div>);
}
