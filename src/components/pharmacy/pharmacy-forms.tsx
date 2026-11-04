"use client";
import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import { consumeAction, createProductAction, reverseAction, saleAction, stockAction, toggleProductAction, updateProductAction } from "@/app/(app)/pharmacie/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";

type P = { id: string; name: string; price: string; currency: string; quantityOnHand: number; minStockLevel: number; unit: string; hasPhoto: boolean };
const fmt = (n: number, c: string) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;

export function Shop({ products, canSell }: { products: P[]; canSell: boolean }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [state, action] = useActionToast(async (s, fd) => { const r = await saleAction(s, fd); if (r?.ok) setCart({}); return r; });
  const lines = Object.entries(cart).map(([id, q]) => ({ p: products.find((x) => x.id === id)!, q })).filter((l) => l.p);
  const totals = useMemo(() => lines.reduce<Record<string, number>>((t, l) => ((t[l.p.currency] = (t[l.p.currency] ?? 0) + Number(l.p.price) * l.q), t), {}), [lines]);
  const set = (id: string, q: number) => setCart((c) => { const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const low = p.quantityOnHand <= p.minStockLevel, inCart = cart[p.id] ?? 0;
          return (<li key={p.id} className="glass flex flex-col overflow-hidden rounded-2xl">
            <div className="flex h-32 items-center justify-center bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.hasPhoto ? <img src={`/fichiers/produits/${p.id}/photo`} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-sm text-muted">Pas de photo</span>}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <p className="font-semibold">{p.name}</p>
              <p className="text-lg font-semibold">{fmt(Number(p.price), p.currency)} <span className="text-xs font-normal text-muted">/ {p.unit}</span></p>
              <p className={`text-sm ${p.quantityOnHand === 0 ? "text-danger" : low ? "text-[#ffe7b3]" : "text-muted"}`}>{p.quantityOnHand === 0 ? "Rupture de stock" : `${p.quantityOnHand} en stock${low ? " — stock bas" : ""}`}</p>
              {canSell && p.quantityOnHand > 0 && (
                <div className="mt-auto flex items-center gap-2">
                  {inCart ? <>
                    <Button variant="secondary" onClick={() => set(p.id, inCart - 1)} aria-label={`Retirer un ${p.name}`}><Minus className="size-4" /></Button>
                    <span className="min-w-8 text-center font-semibold" aria-live="polite">{inCart}</span>
                    <Button variant="secondary" disabled={inCart >= p.quantityOnHand} onClick={() => set(p.id, inCart + 1)} aria-label={`Ajouter un ${p.name}`}><Plus className="size-4" /></Button>
                  </> : <Button variant="secondary" onClick={() => set(p.id, 1)} aria-label={`Ajouter ${p.name} au panier`}><ShoppingCart className="size-4" />Ajouter</Button>}
                </div>
              )}
            </div>
          </li>);
        })}
      </ul>
      {canSell && (
        <aside className="glass h-fit rounded-2xl p-4 xl:sticky xl:top-6" aria-label="Panier">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><ShoppingCart className="size-5" />Panier</h2>
          {lines.length === 0 ? <p className="text-sm text-muted">Panier vide.</p> : (
            <form action={action} className="space-y-3">
              <ul className="space-y-2 text-sm">{lines.map((l) => <li key={l.p.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{l.q} × {l.p.name}</span><span className="flex items-center gap-1">{fmt(Number(l.p.price) * l.q, l.p.currency)}
                  <button type="button" onClick={() => set(l.p.id, 0)} aria-label={`Retirer ${l.p.name}`} className="rounded p-1 text-muted hover:text-ink"><Trash2 className="size-4" /></button></span>
                <input type="hidden" name="productId" value={l.p.id} /><input type="hidden" name="quantity" value={l.q} /></li>)}</ul>
              <p className="border-t border-white/15 pt-2 text-right font-semibold">{Object.entries(totals).map(([c, t]) => fmt(t, c)).join(" + ")}</p>
              {Object.keys(totals).length > 1 && <p className="text-xs text-[#ffe7b3]">Le panier mélange USD et CDF : faites une vente par devise.</p>}
              <Field label="Client (facultatif)" name="customerName" state={state}><Input name="customerName" state={state} /></Field>
              <FormMessage state={state} />
              <SubmitButton className="w-full">Enregistrer la vente</SubmitButton>
              <p className="text-xs text-muted">La facture est transmise à la caisse ; le paiement y est enregistré à réception de l&apos;argent.</p>
            </form>
          )}
        </aside>
      )}
    </div>
  );
}

export function ConsumeForm({ patients, products }: { patients: { id: string; name: string }[]; products: { id: string; name: string }[] }) {
  const [state, action] = useActionToast(consumeAction);
  return (<form action={action} key={state?.ok ? String(Math.random()) : "consume"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
    <Field label="Patient *" name="patientId" state={state} hint={patients.length ? undefined : "Aucun patient présent."}><Select name="patientId" required defaultValue="" state={state}><option value="">Choisir…</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
    <Field label="Produit *" name="productId" state={state}><Select name="productId" required defaultValue="" state={state}><option value="">Choisir…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
    <Field label="Quantité *" name="quantity" state={state}><Input name="quantity" type="number" min={1} defaultValue={1} required state={state} /></Field>
    <SubmitButton>Enregistrer la sortie</SubmitButton>
    <div className="sm:col-span-2 lg:col-span-4"><FormMessage state={state} /></div>
  </form>);
}

type Init = { name?: string; description?: string | null; unit?: string; price?: string; currency?: string; minStockLevel?: number; shopVisible?: boolean };
export function ProductForm({ id, initial = {} }: { id?: string; initial?: Init }) {
  const [state, action] = useActionToast(id ? updateProductAction.bind(null, id) : createProductAction);
  return (<form action={action} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Nom *" name="name" state={state}><Input name="name" required defaultValue={initial.name} state={state} /></Field>
      <Field label="Unité" name="unit" state={state} hint="Ex. : boîte, flacon, unité"><Input name="unit" defaultValue={initial.unit ?? "unité"} state={state} /></Field></div>
    <Field label="Description" name="description" state={state}><Textarea name="description" defaultValue={initial.description ?? ""} state={state} /></Field>
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Prix *" name="price" state={state}><Input name="price" required inputMode="decimal" defaultValue={initial.price} state={state} /></Field>
      <Field label="Devise *" name="currency" state={state}><Select name="currency" defaultValue={initial.currency ?? "USD"} state={state}><option value="USD">USD</option><option value="CDF">CDF</option></Select></Field>
      <Field label="Seuil d'alerte *" name="minStockLevel" state={state}><Input name="minStockLevel" type="number" min={0} required defaultValue={initial.minStockLevel ?? 0} state={state} /></Field>
    </div>
    <Field label="Photo" name="photo" state={state} hint="JPEG, PNG ou WebP — 5 Mo maximum."><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-ink" /></Field>
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="shopVisible" defaultChecked={initial.shopVisible ?? true} className="checkbox" />Visible dans la boutique</label>
    <FormMessage state={state} /><SubmitButton>{id ? "Enregistrer" : "Créer le produit"}</SubmitButton>
    {!id && <p className="text-xs text-muted">Le stock initial s&apos;ajoute ensuite par une « entrée en stock ».</p>}
  </form>);
}

export function StockForms({ id }: { id: string }) {
  const [mode, setMode] = useState<null | "entry" | "adjust">(null);
  const [state, action] = useActionToast(async (s, fd) => { const r = await stockAction(id, s, fd); if (r?.ok) setMode(null); return r; });
  return (<div className="flex flex-wrap gap-2">
    <Button onClick={() => setMode("entry")}><Plus className="size-4" />Entrée en stock</Button>
    <Button variant="secondary" onClick={() => setMode("adjust")}>Correction d&apos;inventaire</Button>
    <Dialog open={!!mode} onClose={() => setMode(null)} title={mode === "adjust" ? "Correction d'inventaire" : "Entrée en stock"} size="sm">
      <form action={action} className="space-y-3">
        <input type="hidden" name="kind" value={mode ?? "entry"} />
        <Field label={mode === "adjust" ? "Écart (+ ou −) *" : "Quantité reçue *"} name="quantity" state={state}><Input name="quantity" type="number" required state={state} /></Field>
        <Field label={mode === "adjust" ? "Motif *" : "Référence / remarque"} name="reason" state={state}><Input name="reason" required={mode === "adjust"} state={state} /></Field>
        <FormMessage state={state} /><div className="flex justify-end"><SubmitButton>Enregistrer</SubmitButton></div>
      </form>
    </Dialog>
  </div>);
}

export function ReverseMovement({ productId, movementId }: { productId: string; movementId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(reverseAction.bind(null, productId, movementId));
  return (<>
    <Button variant="ghost" className="!min-h-9 text-xs" onClick={() => setOpen(true)}>Annuler</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Annuler cette consommation" size="sm">
      <form action={action} className="space-y-3"><p className="text-sm">Le produit revient en stock et la prestation est retirée du compte du patient (si elle n&apos;est pas encore facturée).</p>
        <Field label="Motif *" name="reason" state={state}><Input name="reason" required state={state} /></Field>
        <FormMessage state={state} /><div className="flex justify-end"><SubmitButton variant="danger">Annuler la consommation</SubmitButton></div></form>
    </Dialog>
  </>);
}

export function ToggleProduct({ id, active }: { id: string; active: boolean }) {
  const [state, action] = useActionToast(toggleProductAction.bind(null, id, !active));
  return (<form action={action}><FormMessage state={state} />{active
    ? <ConfirmSubmit variant="ghost" label="Retirer le produit" title="Retirer ce produit ?" confirmLabel="Retirer" message="Il n'apparaîtra plus à la vente ni pour les consommations. Son historique est conservé." />
    : <SubmitButton variant="secondary">Réactiver le produit</SubmitButton>}</form>);
}
