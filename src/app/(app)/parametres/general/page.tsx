import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { getSettings } from "@/server/services/settings";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { PatientNumberForm } from "./form";

export const metadata = { title: "Paramètres généraux" };
export default async function Page() {
  const actor = await requirePage("settings", "view");
  const s = await getSettings();
  const isDefault = s["patients.numberPrefix"].isDefault && s["patients.numberPadding"].isDefault;
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Paramètres généraux" />
      <Card>
        <h2 className="mb-1 text-lg font-semibold">Numéro de dossier patient</h2>
        <p className="mb-4 text-sm text-muted">Attribué automatiquement à chaque nouveau dossier, sans trou ni doublon.</p>
        {isDefault && <div className="mb-4"><Alert tone="warning" title="À confirmer par l'hôpital">Le format actuel est une valeur provisoire.</Alert></div>}
        <PatientNumberForm prefix={String(s["patients.numberPrefix"].value)} padding={Number(s["patients.numberPadding"].value)}
          withYear={Boolean(s["patients.numberWithYear"].value)} canEdit={can(actor, "settings", "update")} />
      </Card>
    </div>
  );
}
