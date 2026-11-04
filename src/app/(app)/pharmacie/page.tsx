import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { listProducts, pharmacyStats } from "@/server/services/pharmacy";
import { displayName } from "@/server/services/patients";
import { db } from "@/server/db";
import { redirect } from "next/navigation";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { buttonClass } from "@/components/ui/button-class";
import { ConsumeForm, Shop } from "@/components/pharmacy/pharmacy-forms";

export const metadata = { title: "Pharmacie" };
export default async function Page() {
  const actor = await requireActor();
  const canView = can(actor, "pharmacy", "view"), canConsume = can(actor, "pharmacy", "create") || can(actor, "hospitalization", "update");
  if (!canView && !canConsume) redirect("/acces-refuse");
  const products = await listProducts(actor);
  const stats = canView ? await pharmacyStats() : null;
  const present = canConsume ? await db.patient.findMany({ where: { visits: { some: { status: { in: ["WAITING", "ORIENTED", "IN_CONSULTATION", "ADMITTED"] } } } }, orderBy: { lastName: "asc" }, take: 300 }) : [];
  const P = products.map((p) => ({ id: p.id, name: p.name, price: p.price.toString(), currency: p.currency, quantityOnHand: p.quantityOnHand, minStockLevel: p.minStockLevel, unit: p.unit, hasPhoto: !!p.photoPath }));
  const stock = (
    <DataTable rows={products} rowKey={(p) => p.id} caption="Stock" empty="Aucun produit."
      columns={[
        { header: "Produit", mobile: "primary", cell: (p) => canView ? <Link href={`/pharmacie/produits/${p.id}`} className="font-semibold hover:underline after:absolute after:inset-0">{p.name}</Link> : <span className="font-semibold">{p.name}</span> },
        { header: "Stock", cell: (p) => <span className="inline-flex items-center gap-2">{p.quantityOnHand} {p.unit}{p.quantityOnHand <= p.minStockLevel && <Badge tone={p.quantityOnHand === 0 ? "red" : "amber"}>{p.quantityOnHand === 0 ? "Rupture" : "Stock bas"}</Badge>}</span> },
        { header: "Seuil", cell: (p) => p.minStockLevel },
        { header: "Prix", cell: (p) => `${p.price.toString()} ${p.currency}` },
      ]} />
  );
  return (<>
    <PageHeader title="Pharmacie" subtitle="Boutique, stock et consommations des patients"
      actions={can(actor, "pharmacy", "create") && <Link href="/pharmacie/produits/nouveau" className={buttonClass()}><Plus className="size-4" />Nouveau produit</Link>} />
    {stats && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard label="Produits" value={stats.products} />
      <StatCard label="En alerte de stock" value={stats.low} tone={stats.low ? "red" : "green"} />
      <StatCard label="Sorties (24 h)" value={(stats.last24h.SALE ?? 0) + (stats.last24h.PATIENT_CONSUMPTION ?? 0)} tone="amber" />
    </div>}
    {products.length === 0 ? <EmptyState title="Aucun produit enregistré." /> : (
      <Tabs tabs={[
        ...(canView ? [{ label: "Boutique", content: <Shop products={P.filter((p) => products.find((x) => x.id === p.id)!.shopVisible)} canSell={can(actor, "pharmacy", "create")} /> }] : []),
        ...(canConsume ? [{ label: "Consommation patient", content: <div className="glass rounded-2xl p-4"><p className="mb-3 text-sm text-muted">Produit utilisé pour un patient pendant ses soins : sortie de stock et montant ajouté à son compte (facturé avec ses autres prestations).</p>
          <ConsumeForm patients={present.map((p) => ({ id: p.id, name: `${displayName(p)} — ${p.patientNumber}` }))} products={P.filter((p) => p.quantityOnHand > 0).map((p) => ({ id: p.id, name: `${p.name} (${p.quantityOnHand} en stock)` }))} /></div> }] : []),
        { label: "Stock", count: stats?.low || undefined, content: stock },
      ]} />
    )}
  </>);
}
