import { requirePage } from "@/server/auth/current";
import { Card, PageHeader } from "@/components/ui/card";
import { PatientForm } from "@/components/patients/patient-form";

export const metadata = { title: "Nouveau dossier patient" };
export default async function Page() {
  await requirePage("patients", "create");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nouveau dossier patient" subtitle="Informations administratives. Le système vérifie automatiquement les doublons." />
      <Card><PatientForm mode="create" /></Card>
    </div>
  );
}
