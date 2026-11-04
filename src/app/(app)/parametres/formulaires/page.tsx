import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { activeForm } from "@/server/services/specialties";
import { MATERNITY_CONTEXTS } from "@/server/services/hospitalization";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { FormBuilder } from "../specialites/forms";

export const metadata = { title: "Formulaires de maternité" };
export default async function Page() {
  const actor = await requirePage("settings", "view");
  const edit = can(actor, "settings", "update");
  const forms = await Promise.all(MATERNITY_CONTEXTS.map(async (m) => ({ ...m, form: await activeForm(null, m.context as never) })));
  return (
    <div className="space-y-5">
      <PageHeader title="Formulaires de maternité" subtitle="Suivi prénatal, accouchement, nouveau-né, suivi postnatal" />
      <Alert tone="warning" title="À valider par les responsables médicaux">Le contenu exact de ces fiches doit être défini avec les sages-femmes et médecins. Aucun champ médical n'est imposé par le logiciel.</Alert>
      {forms.map((f) => (
        <Card key={f.context}>
          <h2 className="mb-3 text-lg font-semibold">{f.label}</h2>
          {edit ? <FormBuilder specialtyId={null} context={f.context as never} initial={(f.form?.fields ?? []) as never} validated={f.form?.validated ?? false} version={f.form?.version ?? null} />
            : <p className="text-sm text-muted">{f.form ? `Version ${f.form.version}` : "Aucun champ défini."}</p>}
        </Card>
      ))}
    </div>
  );
}
