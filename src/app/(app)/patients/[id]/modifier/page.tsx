import { notFound } from "next/navigation";
import { requirePage } from "@/server/auth/current";
import { getPatientRecord, displayName } from "@/server/services/patients";
import { Card, PageHeader } from "@/components/ui/card";
import { PatientForm } from "@/components/patients/patient-form";

export const metadata = { title: "Modifier le dossier" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("patients", "update");
  const rec = await getPatientRecord(actor, (await params).id);
  if (!rec) notFound();
  const p = rec.patient;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Modifier le dossier" subtitle={`${displayName(p)} · ${p.patientNumber}`} />
      <Card><PatientForm mode="edit" id={p.id} initial={{ ...p, birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null }} /></Card>
    </div>
  );
}
