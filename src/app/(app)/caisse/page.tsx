import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { redirect } from "next/navigation";
import { INVOICE_STATUS, fmtMoney, listInvoices, patientsToInvoice } from "@/server/services/billing";
import { cashJournal } from "@/server/services/finance";
import { displayName } from "@/server/services/patients";
import { todayBounds } from "@/lib/normalize";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { CreateInvoice } from "@/components/billing/billing-forms";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";
import type { InvoiceStatus } from "@prisma/client";

export const metadata = { title: "Caisse" };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "cash", "view") && !can(actor, "billing", "view")) redirect("/acces-refuse");
  const sp = await searchParams;
  const { start, end } = todayBounds();
  const [toInvoice, invoices, today] = await Promise.all([
    patientsToInvoice(actor), listInvoices(actor, { status: (sp.statut as InvoiceStatus) || "open", q: sp.q }),
    can(actor, "cash", "view") ? cashJournal(actor, start, end, can(actor, "finance", "view") ? undefined : actor.userId) : null,
  ]);
  return (<>
    <PageHeader title="Caisse" subtitle="Factures à régler, encaissements et reçus" />
    {today && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Encaissé aujourd'hui (USD)" value={fmtMoney(today.totals.USD ?? 0, "USD")} tone="green" />
      <StatCard label="Encaissé aujourd'hui (CDF)" value={fmtMoney(today.totals.CDF ?? 0, "CDF")} tone="green" />
      <StatCard label="Paiements aujourd'hui" value={today.payments.length} />
      <StatCard label="Patients à facturer" value={toInvoice.length} tone="amber" />
    </div>}
    {toInvoice.length > 0 && <Card className="mb-5">
      <h2 className="mb-3 text-lg font-semibold">Prestations à facturer</h2>
      <ul className="divide-y divide-white/10">{toInvoice.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
          <span className="min-w-0 flex-1"><Link href={`/patients/${p.id}`} className="font-semibold hover:underline">{displayName(p)}</Link><span className="block text-sm text-muted">{p.patientNumber} · {p.lines} prestation{p.lines > 1 ? "s" : ""} non facturée{p.lines > 1 ? "s" : ""}</span></span>
          <CreateInvoice patientId={p.id} />
        </li>))}</ul>
    </Card>}
    <form className="mb-4 flex flex-wrap gap-2" role="search">
      <input name="q" defaultValue={sp.q} placeholder="N° de facture, patient, dossier" className="field max-w-sm" aria-label="Rechercher une facture" />
      <select name="statut" defaultValue={sp.statut ?? ""} className="field !w-auto" aria-label="Statut"><option value="">À régler</option>{Object.entries(INVOICE_STATUS).filter(([k]) => k !== "DRAFT").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className={buttonClass("secondary")}>Afficher</button>
    </form>
    {invoices.length === 0 ? <EmptyState title="Aucune facture." /> : (
      <ul className="space-y-3">{invoices.map((i) => (
        <li key={i.id}><Link href={`/caisse/factures/${i.id}`} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4 hover:border-white/35">
          <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 font-semibold">{i.number} — {i.patient ? displayName(i.patient) : i.sale?.customerName ?? "Vente pharmacie"}
            <Badge tone={i.status === "PAID" ? "green" : i.status === "CANCELLED" ? "red" : "amber"}>{INVOICE_STATUS[i.status]}</Badge>
            {i.creditRequests.some((c) => c.status === "PENDING") && <Badge tone="blue">Crédit demandé</Badge>}{i.creditRequests.some((c) => c.status === "APPROVED") && <Badge tone="blue">Crédit approuvé</Badge>}</p>
            <p className="text-sm text-muted">{fmtDateTime(i.issuedAt)} · total {fmtMoney(i.total, i.currency)} · reste {fmtMoney(i.total.sub(i.amountPaid), i.currency)}</p></div>
        </Link></li>))}</ul>
    )}
  </>);
}
