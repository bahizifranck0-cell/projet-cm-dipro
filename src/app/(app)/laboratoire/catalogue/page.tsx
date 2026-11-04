import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { listLabTests } from "@/server/services/laboratory";
import { db } from "@/server/db";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LabTestForm, LabTestToggle } from "@/components/medical/lab-forms";

export const metadata = { title: "Catalogue d'analyses" };
export default async function Page() {
  const actor = await requirePage("laboratory", "view");
  const edit = can(actor, "laboratory", "create");
  const [tests, tariffs] = await Promise.all([listLabTests(), db.tariffItem.findMany({ where: { category: "LAB", active: true }, orderBy: { name: "asc" } })]);
  const topts = tariffs.map((t) => ({ id: t.id, name: `${t.name} — ${t.price} ${t.currency}` }));
  return (<div className="space-y-5">
    <PageHeader title="Catalogue d'analyses" />
    <Alert tone="info">La liste officielle des analyses et leurs valeurs de référence sont à fournir par le laboratoire : aucune n'est créée d'office.</Alert>
    {edit && <Card><h2 className="mb-3 text-lg font-semibold">Nouvelle analyse</h2><LabTestForm tariffs={topts} /></Card>}
    {tests.length === 0 ? <EmptyState title="Catalogue vide." /> : tests.map((t) => (
      <Card key={t.id} className={t.active ? "" : "opacity-60"}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{t.code} — {t.name} {!t.active && <Badge tone="red">Retirée</Badge>}</p>{edit && <LabTestToggle id={t.id} active={t.active} name={t.name} />}</div>
        {edit ? <LabTestForm test={t} tariffs={topts} /> : <p className="text-sm text-muted">{[t.category, t.sampleType, t.unit, t.referenceRange].filter(Boolean).join(" · ")}</p>}
      </Card>
    ))}
  </div>);
}
