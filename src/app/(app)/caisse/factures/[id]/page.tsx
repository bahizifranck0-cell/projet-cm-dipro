import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { fmtMoney, getInvoice, INVOICE_STATUS } from "@/server/services/billing";
import { displayName } from "@/server/services/patients";
import { markEntityRead } from "@/server/services/notifications";
import { db } from "@/server/db";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { buttonClass } from "@/components/ui/button-class";
import { CancelInvoice, CreditRequest, DiscountDecision, DiscountRequest, InvoicePdfButton, PaymentForm, ReversePayment } from "@/components/billing/billing-forms";
import { fmtDateTime } from "@/lib/labels";
import { redirect } from "next/navigation";

export const metadata = { title: "Facture" };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creee?: string }> }) {
  const actor = await requireActor();
  if (!["billing", "cash", "credit", "finance"].some((m) => can(actor, m as "cash", "view"))) redirect("/acces-refuse");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const inv = await getInvoice(actor, id);
  if (!inv) notFound();
  await markEntityRead(actor, "Invoice", id);
  const docs = await db.document.findMany({ where: { OR: [{ entityType: "Invoice", entityId: id }, { entityType: "Payment", entityId: { in: inv.payments.map((p) => p.id) } }] }, orderBy: { version: "desc" } });
  const balance = inv.total.sub(inv.amountPaid);
  const open = inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID";
  const credit = inv.creditRequests.find((c) => c.status !== "REJECTED");
  const invDoc = docs.find((d) => d.entityType === "Invoice");
  const lines = inv.type === "DIRECT_SALE"
    ? inv.sale!.items.map((i) => ({ id: i.id, d: i.product.name, s: "Pharmacie", q: String(i.quantity), u: fmtMoney(i.unitPrice, inv.currency), t: fmtMoney(i.total, inv.currency) }))
    : inv.charges.map((c) => ({ id: c.id, d: c.description, s: c.department?.name ?? "—", q: c.quantity.toString(), u: fmtMoney(c.unitPrice, c.currency), t: fmtMoney(c.amountInInvoiceCcy ?? c.total, inv.currency) }));
  return (<div className="space-y-5">
    <Link href="/caisse" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Caisse</Link>
    {sp.creee && <Alert tone="success">Facture établie. Elle n&apos;est pas encore payée : enregistrez le paiement à réception de l&apos;argent.</Alert>}
    <PageHeader title={`Facture ${inv.number}`} subtitle={`${inv.patient ? `${displayName(inv.patient)} · ${inv.patient.patientNumber}` : inv.sale?.customerName ?? "Vente pharmacie"} · émise le ${fmtDateTime(inv.issuedAt)}`}
      actions={<Badge tone={inv.status === "PAID" ? "green" : inv.status === "CANCELLED" ? "red" : "amber"}>{INVOICE_STATUS[inv.status]}</Badge>} />
    <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
        <DataTable rows={lines} rowKey={(l) => l.id} caption="Lignes de la facture" columns={[
          { header: "Description", mobile: "primary", cell: (l) => <span className="font-medium">{l.d}</span> },
          { header: "Service", cell: (l) => l.s }, { header: "Qté", cell: (l) => l.q }, { header: "Prix unitaire", cell: (l) => l.u }, { header: "Sous-total", cell: (l) => <strong>{l.t}</strong> },
        ]} />
        <Card>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:ml-auto sm:w-80">
            <dt className="text-muted">Sous-total</dt><dd className="text-right">{fmtMoney(inv.subtotal, inv.currency)}</dd>
            {inv.discountTotal.gt(0) && <><dt className="text-muted">Remise</dt><dd className="text-right">− {fmtMoney(inv.discountTotal, inv.currency)}</dd></>}
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{fmtMoney(inv.total, inv.currency)}</dd>
            <dt className="text-muted">Déjà payé</dt><dd className="text-right">{fmtMoney(inv.amountPaid, inv.currency)}</dd>
            <dt className="text-lg font-semibold">Reste à payer</dt><dd className="text-right text-lg font-semibold">{fmtMoney(balance, inv.currency)}</dd>
          </dl>
          {inv.exchangeRate && <p className="mt-2 text-right text-xs text-muted">Taux appliqué : 1 USD = {inv.exchangeRate.toString()} CDF</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {invDoc ? <a href={`/fichiers/documents/${invDoc.id}`} target="_blank" className={buttonClass("secondary")}><FileText className="size-4" />Facture PDF</a> : <InvoicePdfButton id={inv.id} />}
            {open && can(actor, "billing", "update") && <DiscountRequest id={inv.id} />}
            {open && can(actor, "credit", "create") && !credit && inv.patientId && <CreditRequest id={inv.id} />}
            {inv.status === "ISSUED" && can(actor, "billing", "validate") && <CancelInvoice id={inv.id} />}
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Paiements</h2>
          {inv.payments.length === 0 ? <p className="text-sm text-muted">Aucun paiement enregistré.</p> : (
            <ul className="divide-y divide-white/10 text-sm">{inv.payments.map((p) => { const d = docs.find((x) => x.entityId === p.id); return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1"><strong>{p.number}</strong> · {fmtDateTime(p.receivedAt)} · {fmtMoney(p.amount, p.currency)}{p.currency !== inv.currency && ` (= ${fmtMoney(p.amountInInvoiceCcy, inv.currency)})`}{p.reversalReason && <span className="text-[#ffd0d5]"> · extourne : {p.reversalReason}</span>}</span>
                {p.reversedBy && <Badge tone="red">Extourné</Badge>}
                {d && <a href={`/fichiers/documents/${d.id}`} target="_blank" className="font-semibold text-brand-300 hover:underline">Reçu PDF</a>}
                {p.amount.gt(0) && !p.reversedBy && can(actor, "finance", "validate") && <ReversePayment invoiceId={inv.id} paymentId={p.id} number={p.number} />}
              </li>); })}</ul>
          )}
        </Card>
      </div>
      <div className="space-y-5">
        {open && can(actor, "cash", "create") && <Card><h2 className="mb-3 text-lg font-semibold">Encaisser</h2><PaymentForm id={inv.id} currency={inv.currency} balance={balance.toFixed(2)} /></Card>}
        {inv.discounts.length > 0 && <Card><h2 className="mb-3 text-lg font-semibold">Remises</h2><ul className="space-y-3 text-sm">{inv.discounts.map((d) => (
          <li key={d.id}><p>{fmtMoney(d.amount, inv.currency)} — {d.reason} <Badge tone={d.status === "APPROVED" ? "green" : d.status === "REJECTED" ? "red" : "amber"}>{d.status === "APPROVED" ? "Appliquée" : d.status === "REJECTED" ? "Refusée" : "En attente"}</Badge></p>
            {d.status === "PENDING" && can(actor, "billing", "validate") && <div className="mt-2"><DiscountDecision invoiceId={inv.id} discountId={d.id} /></div>}</li>))}</ul></Card>}
        {credit && <Card><h2 className="mb-2 text-lg font-semibold">Crédit</h2>
          <p className="text-sm">{credit.status === "PENDING" ? "Demande en attente de décision du Directeur général." : `Approuvé par le Directeur général le ${fmtDateTime(credit.decidedAt)}.`}</p>
          {inv.debt && <p className="mt-1 text-sm">Dette : {inv.debt.status === "SETTLED" ? "soldée" : `reste ${fmtMoney(balance, inv.currency)}`}</p>}</Card>}
      </div>
    </div>
  </div>);
}
