import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { ADMISSION_TYPE, getAdmission, MATERNITY_CONTEXTS } from "@/server/services/hospitalization";
import { financialClearance } from "@/server/services/clearance";
import { activeForm } from "@/server/services/specialties";
import { availableBeds } from "@/server/services/beds";
import { markEntityRead } from "@/server/services/notifications";
import { displayName, ageFrom } from "@/server/services/patients";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { AssignBed, DischargeForm, MaternityForm, NewbornForm, NoteForm } from "@/components/medical/hospital-forms";
import type { FieldDef } from "@/components/medical/consultation-editor";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Admission" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ admis?: string }> }) {
  const actor = await requirePage("hospitalization", "view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await getAdmission(actor, id);
  if (!a) notFound();
  await markEntityRead(actor, "Admission", id);
  const active = a.status === "ACTIVE";
  const edit = active && can(actor, "hospitalization", "update");
  const [beds, fin, forms] = await Promise.all([
    edit ? availableBeds() : Promise.resolve([]),
    financialClearance(a.patientId),
    a.type === "MATERNITY" ? Promise.all(MATERNITY_CONTEXTS.map(async (m) => ({ ...m, form: await activeForm(null, m.context as never) }))) : Promise.resolve([]),
  ]);
  const current = a.bedAssignments.find((b) => !b.endAt);
  const age = ageFrom(a.patient.birthDate);
  const blocked = fin.ok ? null : fin.uninvoicedCharges ? "Des prestations ne sont pas encore facturées : la caisse doit établir la facture." : `Reste à payer : ${fin.balance}. La sortie sera refusée sans paiement ou crédit approuvé par le Directeur général.`;

  const notes = (
    <div className="space-y-4">
      {edit && <NoteForm id={a.id} />}
      {a.notes.length === 0 ? <EmptyState title="Aucune note de suivi." /> : (
        <ol className="space-y-2">{a.notes.map((n) => <li key={n.id} className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm">
          <p className="text-xs text-muted">{fmtDateTime(n.at)} · {n.kind} · {a.authors[n.authorId] ?? "—"}</p><p className="mt-1 whitespace-pre-wrap">{n.content}</p></li>)}</ol>
      )}
    </div>
  );
  const moves = (
    <ol className="space-y-2 text-sm">{a.bedAssignments.map((b) => <li key={b.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/15 p-3">
      <span>{b.bed.room.code} · lit {b.bed.code} <span className="text-muted">({b.bed.room.category})</span></span><span className="text-muted">{fmtDateTime(b.startAt)} → {b.endAt ? fmtDateTime(b.endAt) : "en cours"}</span></li>)}
      {a.bedAssignments.length === 0 && <li className="text-muted">Aucun lit attribué.</li>}</ol>
  );
  const maternity = a.type === "MATERNITY" && (
    <div className="space-y-5">
      {a.maternityRecords.map((r) => {
        const label = MATERNITY_CONTEXTS.find((m) => m.context === r.context)?.label ?? r.context;
        const fields = (r.formTemplate?.fields ?? []) as FieldDef[];
        const data = r.data as Record<string, unknown>;
        return (<div key={r.id} className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm">
          <p className="font-medium">{label} <span className="font-normal text-muted">· {fmtDateTime(r.recordedAt)} · {a.authors[r.recordedById] ?? ""}</span></p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">{fields.map((f) => <div key={f.key}><dt className="text-muted">{f.label}</dt><dd>{String(data[f.key] ?? "—")}</dd></div>)}</dl>
          {typeof data.notes === "string" && <p className="mt-2 whitespace-pre-wrap">{data.notes}</p>}
          {r.newborns.map((n) => { const d = n.data as Record<string, string | null>; return <p key={n.id} className="mt-2">Nouveau-né : <strong>{d.firstName ?? "—"}</strong>{d.sex ? ` (${d.sex})` : ""}{n.childPatientId && <> · <Link href={`/patients/${n.childPatientId}`} className="text-brand-300 hover:underline">dossier</Link></>}</p>; })}
          {edit && r.context === "MATERNITY_DELIVERY" && <NewbornForm admissionId={a.id} deliveryId={r.id} canCreateRecord={can(actor, "patients", "create")} />}
        </div>);
      })}
      {edit && forms.map((f) => <div key={f.context} className="border-t border-white/10 pt-4">
        {!f.form?.validated && <p className="mb-2 text-xs text-[#ffe7b3]">Formulaire non encore validé par les responsables médicaux{f.form ? "" : " (aucun champ défini : notes libres)"}.</p>}
        <MaternityForm id={a.id} context={f.context as never} label={f.label} fields={(f.form?.fields ?? []) as FieldDef[]} />
      </div>)}
    </div>
  );

  return (
    <div className="space-y-5">
      <Link href="/hospitalisation" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Urgences et hospitalisation</Link>
      {sp.admis && <Alert tone="success">Admission enregistrée. Le service a été notifié.</Alert>}
      <PageHeader title={displayName(a.patient)} subtitle={`${a.patient.patientNumber}${age !== null ? ` · ${age} ans` : ""} · admis le ${fmtDateTime(a.admittedAt)}${a.decidedByDoctor ? ` · décidé par Dr ${a.decidedByDoctor.lastName.toUpperCase()}` : ""}`}
        actions={<><Badge tone={a.type === "EMERGENCY" ? "red" : a.type === "MATERNITY" ? "amber" : "blue"}>{ADMISSION_TYPE[a.type]}</Badge>{active ? <Badge tone="green">Présent</Badge> : <Badge>Sorti le {fmtDateTime(a.dischargedAt)}</Badge>}</>} />
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>{current ? <>Lit actuel : <strong>{current.bed.room.code} · lit {current.bed.code}</strong> <span className="text-muted">({current.bed.room.category})</span></> : active ? <span className="text-[#ffe7b3]">Aucun lit attribué.</span> : "Séjour terminé."}</p>
          <Link href={`/patients/${a.patientId}`} className="text-sm font-semibold text-brand-300 hover:underline">Dossier du patient</Link>
        </div>
        {a.reason && <p className="text-sm"><span className="text-muted">Motif :</span> {a.reason}</p>}
        {edit && <AssignBed id={a.id} beds={beds} current={!!current} />}
        {active && can(actor, "hospitalization", "validate") && (
          <div className="border-t border-white/10 pt-4">
            {blocked ? <Alert tone="warning" title="Situation financière">{blocked}</Alert> : <Alert tone="success">Situation financière réglée{fin.creditApprovedInvoices.length ? " (crédit approuvé par le Directeur général)" : ""}.</Alert>}
            <div className="mt-3"><DischargeForm id={a.id} blocked={blocked} /></div>
          </div>
        )}
        {!active && a.dischargeNotes && <p className="text-sm"><span className="text-muted">Notes de sortie :</span> {a.dischargeNotes}</p>}
      </Card>
      <Card>
        <Tabs tabs={[{ label: "Suivi", count: a.notes.length, content: notes }, ...(maternity ? [{ label: "Maternité", count: a.maternityRecords.length, content: maternity }] : []), { label: "Mouvements de lit", count: a.bedAssignments.length, content: moves }]} />
      </Card>
    </div>
  );
}
