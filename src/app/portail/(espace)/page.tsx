import { Download } from "lucide-react";
import { requirePortal } from "@/server/portal/session";
import { portalData } from "@/server/services/portal";
import { fmtMoney, INVOICE_STATUS } from "@/server/services/billing";
import { APPT_STATUS } from "@/server/services/appointments";
import { ADMISSION_TYPE, MATERNITY_CONTEXTS } from "@/server/services/hospitalization";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Mon dossier" };
const H = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="mb-3 scroll-mt-28 text-lg font-semibold">{children}</h2>;
export default async function Page({ searchParams }: { searchParams: Promise<{ mdp?: string }> }) {
  const s = await requirePortal();
  const d = await portalData(s.patientId);
  const upcoming = d.appts.filter((a) => a.status === "SCHEDULED" && a.scheduledAt > new Date());
  const toPay = d.invoices.filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID");
  const docUrl = (id: string) => `/portail/documents/${id}`;
  const docFor = (entityType: string, entityId: string) => d.docs.find((x) => x.entityType === entityType && x.entityId === entityId);
  return (<div className="space-y-5">
    {(await searchParams).mdp && <Alert tone="success">Mot de passe modifié.</Alert>}
    <div className="grid grid-cols-2 gap-3">
      <Card className="!p-4"><p className="text-sm text-muted">Prochain rendez-vous</p><p className="font-semibold">{upcoming.at(-1) ? fmtDateTime(upcoming.at(-1)!.scheduledAt) : "Aucun"}</p></Card>
      <Card className="!p-4"><p className="text-sm text-muted">Reste à payer</p><p className="font-semibold">{toPay.length ? toPay.map((i) => fmtMoney(i.total.sub(i.amountPaid), i.currency)).join(" + ") : "Rien"}</p></Card>
    </div>

    <Card><H id="consultations">Mes consultations</H>
      {d.consultations.length === 0 ? <EmptyState title="Aucune consultation communiquée." /> : <ul className="space-y-3 text-sm">{d.consultations.map((c) => (
        <li key={c.id} className="rounded-xl border border-white/15 p-3"><p className="font-medium">{c.specialty.name} — Dr {c.doctor.lastName.toUpperCase()} · {fmtDateTime(c.signedAt)}</p>
          {c.diagnosis && <p><span className="text-muted">Diagnostic :</span> {c.diagnosis}</p>}{c.treatment && <p><span className="text-muted">Traitement :</span> {c.treatment}</p>}
          {c.prescriptions.map((p) => { const doc = docFor("Prescription", p.id); return <p key={p.id} className="mt-1"><span className="text-muted">Ordonnance :</span> {p.items.map((i) => `${i.medication}${i.dosage ? ` (${i.dosage})` : ""}`).join(", ")} {doc && <a href={docUrl(doc.id)} className="ml-1 font-semibold text-brand-300 underline">Télécharger</a>}</p>; })}</li>))}</ul>}
    </Card>

    <Card><H id="examens">Mes examens</H>
      {d.labs.length === 0 ? <EmptyState title="Aucun examen." /> : <ul className="space-y-3 text-sm">{d.labs.map((l) => { const doc = docFor("LabRequest", l.id); return (
        <li key={l.id} className="rounded-xl border border-white/15 p-3">
          <p className="flex flex-wrap items-center justify-between gap-2 font-medium">{l.number} · {fmtDateTime(l.requestedAt)}<Badge tone={l.status === "VALIDATED" ? "green" : "amber"}>{l.status === "VALIDATED" ? "Résultats disponibles" : "En cours"}</Badge></p>
          {l.samples.map((x, i) => <p key={i} className="text-muted">Prélèvement : {x.sampleType} · {fmtDateTime(x.collectedAt)}</p>)}
          <ul className="mt-1">{l.items.map((i) => <li key={i.id}>{i.labTest.name}{i.resultValue ? <> : <strong>{i.resultValue} {i.unit}</strong>{i.referenceRange && <span className="text-muted"> (réf. {i.referenceRange})</span>}</> : <span className="text-muted"> — résultat en attente</span>}</li>)}</ul>
          {doc && <a href={docUrl(doc.id)} className={buttonClass("secondary", "mt-2")}><Download className="size-4" />Résultats en PDF</a>}</li>); })}</ul>}
    </Card>

    <Card><H id="rendez-vous">Mes rendez-vous</H>
      {d.appts.length === 0 ? <EmptyState title="Aucun rendez-vous." /> : <ul className="space-y-2 text-sm">{d.appts.map((a) => { const doc = docFor("Appointment", a.id); return (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-3"><span><strong>{fmtDateTime(a.scheduledAt)}</strong> — Dr {a.doctor.lastName.toUpperCase()}{a.specialty && ` (${a.specialty.name})`} · {a.reason}</span>
          <span className="flex items-center gap-2"><Badge tone={a.status === "SCHEDULED" ? "blue" : "gray"}>{APPT_STATUS[a.status]}</Badge>{doc && a.status === "SCHEDULED" && <a href={docUrl(doc.id)} className="font-semibold text-brand-300 underline">PDF</a>}</span></li>); })}</ul>}
    </Card>

    {d.admissions.length > 0 && <Card><H id="hospitalisations">Mes hospitalisations</H><ul className="space-y-2 text-sm">{d.admissions.map((a) => (
      <li key={a.id} className="rounded-xl border border-white/15 p-3">{ADMISSION_TYPE[a.type]} · entrée {fmtDateTime(a.admittedAt)}{a.dischargedAt ? ` · sortie ${fmtDateTime(a.dischargedAt)}` : " · en cours"}
        {a.maternityRecords.length > 0 && <p className="text-muted">Suivi : {a.maternityRecords.map((m) => `${MATERNITY_CONTEXTS.find((c) => c.context === m.context)?.label} (${fmtDateTime(m.recordedAt)})`).join(", ")}</p>}</li>))}</ul></Card>}

    <Card><H id="factures">Mes factures et paiements</H>
      {d.debts.some((x) => x.status !== "SETTLED") && <div className="mb-3"><Alert tone="warning" title="Solde dû">{d.debts.filter((x) => x.status !== "SETTLED").map((x) => `Facture ${x.invoice.number} : reste ${fmtMoney(x.invoice.total.sub(x.invoice.amountPaid), x.currency)}`).join(" · ")}</Alert></div>}
      {d.invoices.length === 0 ? <EmptyState title="Aucune facture." /> : <ul className="space-y-3 text-sm">{d.invoices.map((i) => { const doc = docFor("Invoice", i.id); return (
        <li key={i.id} className="rounded-xl border border-white/15 p-3">
          <p className="flex flex-wrap items-center justify-between gap-2 font-medium">{i.number} · {fmtMoney(i.total, i.currency)}<Badge tone={i.status === "PAID" ? "green" : "amber"}>{INVOICE_STATUS[i.status]}</Badge></p>
          <p className="text-muted">Payé {fmtMoney(i.amountPaid, i.currency)} · reste {fmtMoney(i.total.sub(i.amountPaid), i.currency)}{doc && <> · <a href={docUrl(doc.id)} className="font-semibold text-brand-300 underline">Facture PDF</a></>}</p>
          {i.payments.filter((p) => p.amount.gt(0)).map((p) => { const r = docFor("Payment", p.id); return <p key={p.id}>Reçu {p.number} · {fmtMoney(p.amount, p.currency)} · {fmtDateTime(p.receivedAt)} {r && <a href={docUrl(r.id)} className="font-semibold text-brand-300 underline">Télécharger</a>}</p>; })}</li>); })}</ul>}
    </Card>

    <Card><H id="documents">Mes documents</H>
      {d.docs.length === 0 ? <EmptyState title="Aucun document." /> : <ul className="divide-y divide-white/10 text-sm">{d.docs.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{x.title} <span className="text-muted">· {fmtDateTime(x.createdAt)}</span></span><a href={docUrl(x.id)} className={buttonClass("secondary", "!min-h-9")}><Download className="size-4" />PDF</a></li>)}</ul>}
    </Card>
    {d.visits.length > 0 && <p className="text-center text-xs text-muted">{d.visits.length} passage{d.visits.length > 1 ? "s" : ""} enregistré{d.visits.length > 1 ? "s" : ""} à l&apos;hôpital.</p>}
  </div>);
}
