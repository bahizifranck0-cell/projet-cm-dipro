import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { productDetail } from "@/server/services/pharmacy";
import { displayName } from "@/server/services/patients";
import { markEntityRead } from "@/server/services/notifications";
import { Alert, Badge, Card, PageHeader, StatCard } from "@/components/ui/card";
import { ProductForm, ReverseMovement, StockForms, ToggleProduct } from "@/components/pharmacy/pharmacy-forms";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Produit" };
const TYPE = { ENTRY: "Entrée", SALE: "Vente", PATIENT_CONSUMPTION: "Consommation patient", ADJUSTMENT: "Correction", REVERSAL: "Annulation" } as const;
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cree?: string }> }) {
  const actor = await requirePage("pharmacy", "view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = await productDetail(actor, id);
  if (!p) notFound();
  await markEntityRead(actor, "Product", id);
  const edit = can(actor, "pharmacy", "update");
  return (<div className="space-y-5">
    <Link href="/pharmacie" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Pharmacie</Link>
    {sp.cree && <Alert tone="success">Produit créé. Ajoutez maintenant le stock reçu.</Alert>}
    <PageHeader title={p.name} subtitle={`${p.sku} · ${p.price.toString()} ${p.currency} / ${p.unit}`} actions={!p.active && <Badge tone="red">Retiré</Badge>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard label="En stock" value={`${p.quantityOnHand} ${p.unit}`} tone={p.quantityOnHand <= p.minStockLevel ? "red" : "green"} />
      <StatCard label="Seuil d'alerte" value={p.minStockLevel} tone="amber" />
    </div>
    {edit && p.active && <StockForms id={p.id} />}
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Historique des mouvements</h2>
      {p.movements.length === 0 ? <p className="text-sm text-muted">Aucun mouvement.</p> : (
        <ul className="divide-y divide-white/10 text-sm">{p.movements.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
            <span className="w-36 text-muted">{fmtDateTime(m.at)}</span>
            <span className={`w-14 font-semibold ${m.quantity > 0 ? "text-success" : "text-[#ffd0d5]"}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
            <span className="min-w-0 flex-1">{TYPE[m.type]}{m.patient && ` — ${displayName(m.patient)}`}{m.reason && ` — ${m.reason}`} <span className="text-muted">· {p.userName[m.userId] ?? ""} · solde {m.balanceAfter}</span></span>
            {m.reversedBy && <Badge>Annulé</Badge>}
            {edit && m.type === "PATIENT_CONSUMPTION" && !m.reversedBy && <ReverseMovement productId={p.id} movementId={m.id} />}
          </li>))}</ul>
      )}
    </Card>
    {edit && <Card><h2 className="mb-3 text-lg font-semibold">Fiche produit</h2>
      <ProductForm id={p.id} initial={{ name: p.name, description: p.description, unit: p.unit, price: p.price.toString(), currency: p.currency, minStockLevel: p.minStockLevel, shopVisible: p.shopVisible }} />
      {can(actor, "pharmacy", "delete") && <div className="mt-4 border-t border-white/10 pt-4"><ToggleProduct id={p.id} active={p.active} /></div>}</Card>}
  </div>);
}
