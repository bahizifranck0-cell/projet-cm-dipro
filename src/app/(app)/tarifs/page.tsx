import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { listTariffs } from "@/server/services/billing";
import { listSpecialties } from "@/server/services/specialties";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { TariffForm, TariffToggle } from "@/components/billing/billing-forms";

export const metadata = { title: "Catalogue tarifaire" };
export default async function Page() {
  const actor = await requirePage("billing", "view");
  const [list, specs] = await Promise.all([listTariffs(), listSpecialties(true)]);
  const sp = specs.map((s) => ({ id: s.id, name: s.name }));
  return (<div className="space-y-5">
    <PageHeader title="Catalogue tarifaire" subtitle="Tarifs officiels appliqués automatiquement aux prestations" />
    <Alert tone="info">Aucun tarif n&apos;est fixé par le logiciel : ils sont saisis ici par les personnes autorisées. Les prix des produits se gèrent dans la Pharmacie.</Alert>
    {can(actor, "billing", "create") && <Card><h2 className="mb-3 text-lg font-semibold">Nouveau tarif</h2><TariffForm specialties={sp} /></Card>}
    {list.length === 0 ? <EmptyState title="Aucun tarif." /> : list.map((t) => (
      <Card key={t.id} className={t.active ? "" : "opacity-60"}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{t.code} — {t.name} · {t.price.toString()} {t.currency} / {t.unit} {!t.active && <Badge tone="red">Retiré</Badge>}</p>
          {can(actor, "billing", "update") && <TariffToggle id={t.id} active={t.active} name={t.name} />}</div>
        {can(actor, "billing", "update") && <TariffForm t={{ id: t.id, code: t.code, name: t.name, category: t.category, price: t.price.toString(), currency: t.currency, unit: t.unit, specialtyId: t.specialtyId }} specialties={sp} />}
      </Card>
    ))}
  </div>);
}
