import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { markRead } from "@/server/services/notifications";
import { can } from "@/server/auth/actor";
import { redirect } from "next/navigation";
import { fmtMoney, listCredits, listDebts } from "@/server/services/billing";
import { displayName } from "@/server/services/patients";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { CreditDecision } from "@/components/billing/billing-forms";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Crédits et dettes" };
export default async function Page() {
  const actor = await requireActor();
  await markRead(actor, "all", "credit"); // module sans page de détail : consulter la liste vaut lecture
  if (!can(actor, "credit", "view") && !can(actor, "finance", "view")) redirect("/acces-refuse");
  const [pending, history, debts] = await Promise.all([
    can(actor, "credit", "view") ? listCredits(actor, "PENDING") : [], can(actor, "credit", "view") ? listCredits(actor) : [], listDebts(actor, false),
  ]);
  const decide = can(actor, "credit", "validate");
  return (<>
    <PageHeader title="Crédits et dettes" subtitle="Les demandes de crédit sont décidées uniquement par le Directeur général." />
    <Tabs tabs={[
      { label: "Demandes en attente", count: pending.length, content: pending.length === 0 ? <EmptyState title="Aucune demande en attente." /> : (
        <ul className="space-y-3">{pending.map((c) => (
          <li key={c.id}><Card>
            <p className="font-semibold"><Link href={`/patients/${c.patientId}`} className="hover:underline">{displayName(c.patient)}</Link> — {fmtMoney(c.amount, c.currency)}</p>
            <p className="text-sm text-muted">Facture <Link href={`/caisse/factures/${c.invoiceId}`} className="hover:underline">{c.invoice.number}</Link> · demandé le {fmtDateTime(c.requestedAt)}</p>
            <p className="mt-2 text-sm">Motif : {c.reason}</p>
            {decide ? <div className="mt-3"><CreditDecision id={c.id} /></div> : <p className="mt-2 text-xs text-muted">Décision réservée au Directeur général.</p>}
          </Card></li>))}</ul>) },
      { label: "Dettes", count: debts.filter((d) => d.status !== "SETTLED").length, content: debts.length === 0 ? <EmptyState title="Aucune dette." /> : (
        <ul className="space-y-3">{debts.map((d) => { const rest = d.invoice.total.sub(d.invoice.amountPaid); return (
          <li key={d.id} className="glass rounded-2xl p-4 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-semibold"><Link href={`/patients/${d.patientId}`} className="hover:underline">{displayName(d.patient)}</Link>
              <Badge tone={d.status === "SETTLED" ? "green" : d.status === "PARTIALLY_PAID" ? "amber" : "red"}>{d.status === "SETTLED" ? "Soldée" : d.status === "PARTIALLY_PAID" ? "Remboursée en partie" : "Ouverte"}</Badge></p>
            <p className="text-muted">Facture <Link href={`/caisse/factures/${d.invoiceId}`} className="hover:underline">{d.invoice.number}</Link> · total {fmtMoney(d.invoice.total, d.currency)} · payé {fmtMoney(d.invoice.amountPaid, d.currency)} · <strong className="text-ink">reste {fmtMoney(rest, d.currency)}</strong></p>
            <p className="text-muted">Montant autorisé {fmtMoney(d.originalAmount, d.currency)} le {fmtDateTime(d.createdAt)} · motif : {d.creditRequest.reason}</p>
            {d.invoice.payments.length > 0 && <p className="text-muted">Paiements : {d.invoice.payments.map((p) => `${p.number} (${fmtMoney(p.amount, p.currency)})`).join(", ")}</p>}
          </li>); })}</ul>) },
      ...(history.length ? [{ label: "Historique des décisions", content: <ul className="space-y-2 text-sm">{history.filter((c) => c.status !== "PENDING").map((c) => <li key={c.id} className="rounded-xl border border-white/15 p-3">{displayName(c.patient)} — {fmtMoney(c.amount, c.currency)} — <Badge tone={c.status === "APPROVED" ? "green" : "red"}>{c.status === "APPROVED" ? "Approuvé" : "Refusé"}</Badge> {c.decidedAt && `le ${fmtDateTime(c.decidedAt)}`}{c.decisionNote && ` · ${c.decisionNote}`}</li>)}</ul> }] : []),
    ]} />
  </>);
}
