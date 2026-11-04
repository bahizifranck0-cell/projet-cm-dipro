import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { getLabRequest, LAB_STATUS } from "@/server/services/laboratory";
import { markEntityRead } from "@/server/services/notifications";
import { displayName, ageFrom } from "@/server/services/patients";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { CancelLab, ResultsForm, SampleForm, ValidateButton } from "@/components/medical/lab-forms";
import { fmtDateTime } from "@/lib/labels";
import { redirect } from "next/navigation";

export const metadata = { title: "Demande d'analyses" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "laboratory", "view") && !can(actor, "consultations", "view")) redirect("/acces-refuse");
  const r = await getLabRequest(actor, (await params).id);
  if (!r) notFound();
  await markEntityRead(actor, "LabRequest", r.id);
  const open = r.status !== "VALIDATED" && r.status !== "CANCELLED";
  const work = open && can(actor, "laboratory", "update");
  const age = ageFrom(r.patient.birthDate);
  return (<div className="space-y-5">
    <Link href={can(actor, "laboratory", "view") ? "/laboratoire" : `/patients/${r.patientId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />{can(actor, "laboratory", "view") ? "Laboratoire" : "Dossier du patient"}</Link>
    <PageHeader title={`Demande ${r.number}`} subtitle={`${displayName(r.patient)} · ${r.patient.patientNumber}${age !== null ? ` · ${age} ans` : ""}`}
      actions={<Badge tone={r.status === "VALIDATED" ? "green" : r.status === "CANCELLED" ? "red" : "amber"}>{LAB_STATUS[r.status]}</Badge>} />
    <Card className="space-y-2 text-sm">
      <p><span className="text-muted">Demandé par :</span> {r.consultation ? `Dr ${r.consultation.doctor.lastName.toUpperCase()} ${r.consultation.doctor.firstName} (${r.consultation.specialty.name})` : r.requestedByName} · {fmtDateTime(r.requestedAt)}</p>
      {r.clinicalInfo && <p><span className="text-muted">Renseignements cliniques :</span> {r.clinicalInfo}</p>}
      <p><span className="text-muted">Analyses :</span> {r.items.map((i) => i.labTest.name).join(", ")}</p>
      {r.samples.map((s) => <p key={s.id}><span className="text-muted">Prélèvement :</span> {s.sampleType} · {fmtDateTime(s.collectedAt)} · {r.sampleBy(s.collectedById)}{s.notes && ` · ${s.notes}`}</p>)}
      {r.status === "VALIDATED" && <p><span className="text-muted">Validé par :</span> {r.validatedByName} · {fmtDateTime(r.validatedAt)}</p>}
      {r.status === "CANCELLED" && <Alert tone="danger">{r.conclusion}</Alert>}
    </Card>
    {work && <Card><h2 className="mb-3 text-lg font-semibold">Prélèvement</h2><SampleForm id={r.id} defaultType={r.items[0]?.labTest.sampleType} /></Card>}
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Résultats</h2>
      {work && r.status !== "AWAITING_VALIDATION" ? (
        <ResultsForm id={r.id} conclusion={r.conclusion} canSubmit items={r.items.map((i) => ({ id: i.id, name: i.labTest.name, unit: i.unit, referenceRange: i.referenceRange, resultValue: i.resultValue, flag: i.flag, observation: i.observation }))} />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-white/10 text-sm">{r.items.map((i) => <li key={i.id} className="grid gap-1 py-2 sm:grid-cols-[2fr_1fr_1fr_2fr]">
            <span className="font-medium">{i.labTest.name}</span><span>{i.resultValue ?? "—"} {i.unit}</span><span>{i.flag && <Badge tone={i.flag === "normal" ? "green" : "amber"}>{i.flag}</Badge>}</span><span className="text-muted">{i.referenceRange}{i.observation && ` · ${i.observation}`}</span></li>)}</ul>
          {r.conclusion && r.status !== "CANCELLED" && <p className="text-sm"><span className="text-muted">Conclusion :</span> {r.conclusion}</p>}
          {r.status === "AWAITING_VALIDATION" && (can(actor, "laboratory", "validate") ? <ValidateButton id={r.id} /> : <Alert tone="warning">En attente de validation par le responsable du laboratoire.</Alert>)}
          {r.status === "AWAITING_VALIDATION" && work && <p className="text-xs text-muted">Pour corriger avant validation, contactez le responsable du laboratoire.</p>}
          {r.documentId && <a href={`/fichiers/documents/${r.documentId}`} target="_blank" className={buttonClass("secondary")}><FileText className="size-4" />Résultats en PDF</a>}
        </div>
      )}
    </Card>
    {work && <CancelLab id={r.id} />}
  </div>);
}
