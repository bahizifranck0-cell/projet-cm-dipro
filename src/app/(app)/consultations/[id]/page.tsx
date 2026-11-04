import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { getConsultation } from "@/server/services/consultations";
import { displayName, ageFrom } from "@/server/services/patients";
import { orientationOptions } from "@/server/services/lookups";
import { listSpecialties } from "@/server/services/specialties";
import { db } from "@/server/db";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/card";
import { ConsultationEditor, PrescriptionForm, ReferForm, RemovePrescription, type FieldDef } from "@/components/medical/consultation-editor";
import { NewAppointment } from "@/components/medical/appointment-dialogs";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";
import { can } from "@/server/auth/actor";
import { availableBeds } from "@/server/services/beds";
import { AdmitButton } from "@/components/medical/hospital-forms";
import { LabRequestForm } from "@/components/medical/lab-forms";
import { LAB_STATUS, listLabTests } from "@/server/services/laboratory";

export const metadata = { title: "Consultation" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("consultations", "view");
  const c = await getConsultation(actor, (await params).id);
  if (!c) notFound();
  const fields = ((c.formTemplate?.fields ?? []) as FieldDef[]);
  const formData = (c.formData ?? {}) as Record<string, unknown>;
  const editable = c.status === "DRAFT" && c.doctorId === actor.employeeId;
  const age = ageFrom(c.patient.birthDate);
  const docs = await db.document.findMany({ where: { entityType: "Prescription", entityId: { in: c.prescriptions.map((p) => p.id) } } });
  const opts = editable ? await orientationOptions() : null;
  const specs = editable ? (await listSpecialties(true)).map((s) => ({ id: s.id, name: s.name })) : [];
  const [labRequests, labTests] = await Promise.all([
    db.labRequest.findMany({ where: { consultationId: c.id }, orderBy: { requestedAt: "desc" }, include: { items: { include: { labTest: true } } } }),
    can(actor, "laboratory", "create") && c.doctorId === actor.employeeId ? listLabTests(true) : Promise.resolve([]),
  ]);
  const admitted = await db.admission.findFirst({ where: { patientId: c.patientId, status: "ACTIVE" } });
  const beds = editable && can(actor, "hospitalization", "create") && !admitted ? await availableBeds() : null;

  return (
    <div className="space-y-5">
      <Link href={editable ? "/medecin" : `/patients/${c.patientId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />{editable ? "Espace médecin" : "Dossier du patient"}</Link>
      <PageHeader title={`Consultation — ${c.specialty.name}`} subtitle={`Dr ${c.doctor.lastName.toUpperCase()} ${c.doctor.firstName} · ${fmtDateTime(c.startedAt)}`}
        actions={<>{c.status === "SIGNED" ? <Badge tone="green">Signée le {fmtDateTime(c.signedAt)}</Badge> : <Badge tone="amber">Brouillon</Badge>}{c.specialty.confidential && <Badge tone="amber">Confidentielle</Badge>}</>} />
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div><Link href={`/patients/${c.patientId}`} className="text-lg font-semibold hover:underline">{displayName(c.patient)}</Link>
          <p className="text-sm text-muted">{c.patient.patientNumber}{age !== null && ` · ${age} ans`}{c.patient.sex && ` · ${c.patient.sex === "F" ? "Féminin" : "Masculin"}`}{c.visit.reason && ` · Motif : ${c.visit.reason}`}</p></div>
        <div className="flex flex-wrap gap-2">
        {beds && <AdmitButton patientId={c.patientId} visitId={c.visitId} beds={beds} />}
        {admitted && <Link href={`/hospitalisation/${admitted.id}`} className={buttonClass("secondary")}>Patient hospitalisé</Link>}
        {editable && opts && <NewAppointment patientId={c.patientId} patientName={displayName(c.patient)} doctors={opts.doctors} specialties={specs} defaultDoctorId={c.doctorId} consultationId={c.id} />}
        </div>
      </Card>
      {c.formTemplate && !c.formTemplate.validated && <Alert tone="warning">Le formulaire de cette spécialité n'a pas encore été validé par les professionnels de santé.</Alert>}

      <Card>
        {editable ? (
          <ConsultationEditor id={c.id} fields={fields} formData={formData} specialtyName={c.specialty.name}
            values={{ observations: c.observations ?? "", diagnosis: c.diagnosis ?? "", treatment: c.treatment ?? "", patientVisible: c.patientVisible }} />
        ) : (
          <dl className="space-y-4">
            {fields.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{fields.map((f) => (
              <div key={f.key}><dt className="text-sm text-muted">{f.label}{f.unit ? ` (${f.unit})` : ""}</dt><dd className="font-medium">{formData[f.key] === true ? "Oui" : formData[f.key] === false ? "Non" : String(formData[f.key] ?? "—")}</dd></div>))}</div>}
            {[["Observations", c.observations], ["Diagnostic", c.diagnosis], ["Traitement", c.treatment]].map(([k, v]) => (
              <div key={k}><dt className="text-sm text-muted">{k}</dt><dd className="whitespace-pre-wrap">{v || "—"}</dd></div>))}
            <p className="text-xs text-muted">{c.patientVisible ? "Diagnostic et traitement visibles dans le portail du patient." : "Non communiqué au portail du patient."}</p>
          </dl>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Ordonnances</h2>
        {c.prescriptions.length === 0 && <p className="mb-3 text-sm text-muted">Aucune ordonnance.</p>}
        <ul className="mb-4 space-y-2">{c.prescriptions.map((p) => {
          const doc = docs.find((d) => d.entityId === p.id);
          return (<li key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/15 p-3">
            <ul className="min-w-0 flex-1 text-sm">{p.items.map((i) => <li key={i.id}><strong>{i.medication}</strong>{[i.dosage, i.frequency, i.duration].filter(Boolean).length ? ` — ${[i.dosage, i.frequency, i.duration].filter(Boolean).join(", ")}` : ""}</li>)}</ul>
            {doc && <a href={`/fichiers/documents/${doc.id}`} target="_blank" className={buttonClass("secondary")}><FileText className="size-4" />PDF</a>}
            {editable && <RemovePrescription consultationId={c.id} id={p.id} />}
          </li>);
        })}</ul>
        {editable && <PrescriptionForm id={c.id} />}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Examens de laboratoire</h2>
        {labRequests.length > 0 && <ul className="mb-4 space-y-2">{labRequests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-3 text-sm">
            <span><strong>{r.number}</strong> — {r.items.map((i) => i.labTest.name).join(", ")}</span>
            <span className="flex items-center gap-2"><Badge tone={r.status === "VALIDATED" ? "green" : r.status === "CANCELLED" ? "red" : "amber"}>{LAB_STATUS[r.status]}</Badge><Link href={`/laboratoire/${r.id}`} className="font-semibold text-brand-300 hover:underline">{r.status === "VALIDATED" ? "Voir les résultats" : "Suivre"}</Link></span>
          </li>))}</ul>}
        {c.doctorId === actor.employeeId && can(actor, "laboratory", "create") && c.status !== "CANCELLED"
          ? <LabRequestForm consultationId={c.id} tests={labTests.map((t) => ({ id: t.id, name: t.name, category: t.category, priced: !!t.tariffItemId }))} />
          : labRequests.length === 0 && <p className="text-sm text-muted">Aucun examen demandé.</p>}
      </Card>

      {(editable || c.referrals.length > 0) && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Orientation vers un confrère</h2>
          {c.referrals.map((r) => <p key={r.id} className="mb-2 text-sm">→ {[r.toDepartment?.name, r.toSpecialty?.name, r.toDoctor && `Dr ${r.toDoctor.lastName.toUpperCase()} ${r.toDoctor.firstName}`].filter(Boolean).join(" — ")}{r.reason ? ` : ${r.reason}` : ""}</p>)}
          {editable && opts && <ReferForm id={c.id} departments={opts.departments} specialties={specs} doctors={opts.doctors} />}
        </Card>
      )}
    </div>
  );
}
