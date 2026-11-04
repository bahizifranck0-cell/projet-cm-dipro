"use client";
import { useState, type ReactNode } from "react";
import { Banknote, FileText } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import * as A from "@/app/(app)/caisse/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import type { ActionState } from "@/server/actions/result";

type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;
/** Petit formulaire générique : un bouton qui ouvre une fenêtre avec des champs. */
function DialogForm({ label, title, action, children, submit, variant = "secondary", icon }: { label: string; title: string; action: Act; children: ReactNode; submit: string; variant?: "primary" | "secondary" | "danger" | "ghost"; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, run] = useActionToast(async (s, fd) => { const r = await action(s, fd); if (r?.ok) setOpen(false); return r; });
  return (<>
    <Button variant={variant} onClick={() => setOpen(true)}>{icon}{label}</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title={title} size="sm">
      <form action={run} className="space-y-3">{children}<FormMessage state={state} /><div className="flex justify-end"><SubmitButton variant={variant === "danger" ? "danger" : "primary"}>{submit}</SubmitButton></div></form>
    </Dialog>
  </>);
}

export function CreateInvoice({ patientId }: { patientId: string }) {
  const [state, action] = useActionToast(A.invoiceAction.bind(null, patientId));
  return (<form action={action} className="flex flex-wrap items-center gap-2">
    <Select name="currency" defaultValue="USD" aria-label="Devise de la facture" className="field !w-auto"><option value="USD">USD</option><option value="CDF">CDF</option></Select>
    <SubmitButton pendingLabel="Calcul…"><FileText className="size-4" />Établir la facture</SubmitButton>
    {state?.error && <p className="w-full text-sm text-danger" role="alert">{state.error}</p>}
  </form>);
}

export function PaymentForm({ id, currency, balance }: { id: string; currency: string; balance: string }) {
  const [state, action] = useActionToast(A.paymentAction.bind(null, id));
  return (<form action={action} key={state?.ok ? String(Math.random()) : "pay"} className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
      <Field label="Montant reçu *" name="amount" state={state} hint={`Reste à payer : ${balance} ${currency}`}><Input name="amount" required inputMode="decimal" defaultValue={balance} state={state} /></Field>
      <Field label="Devise" name="currency" state={state}><Select name="currency" defaultValue={currency} state={state}><option value="USD">USD</option><option value="CDF">CDF</option></Select></Field>
    </div>
    <p className="text-xs text-muted">Mode de paiement : espèces (seul moyen confirmé par l&apos;établissement).</p>
    <Field label="Remarque" name="note" state={state}><Input name="note" state={state} /></Field>
    <FormMessage state={state} /><SubmitButton><Banknote className="size-4" />Enregistrer le paiement</SubmitButton>
  </form>);
}

export function InvoicePdfButton({ id }: { id: string }) {
  const [state, action] = useActionToast(A.invoicePdfAction.bind(null, id));
  return <form action={action}><SubmitButton variant="secondary" pendingLabel="Génération…"><FileText className="size-4" />Générer la facture PDF</SubmitButton>{state?.error && <p className="text-sm text-danger">{state.error}</p>}</form>;
}
export function DiscountRequest({ id }: { id: string }) {
  return <DialogForm label="Demander une remise" title="Demande de remise" action={A.discountAction.bind(null, id)} submit="Envoyer la demande">
    <Field label="Montant *" name="amount"><Input name="amount" required inputMode="decimal" /></Field><Field label="Motif *" name="reason"><Input name="reason" required /></Field></DialogForm>;
}
export function DiscountDecision({ invoiceId, discountId }: { invoiceId: string; discountId: string }) {
  const [s1, approve] = useActionToast(A.decideDiscountAction.bind(null, invoiceId, discountId, true));
  const [s2, reject] = useActionToast(A.decideDiscountAction.bind(null, invoiceId, discountId, false));
  return (<div className="flex gap-2"><form action={approve}><SubmitButton pendingLabel="…">Appliquer</SubmitButton></form><form action={reject}><SubmitButton variant="ghost" pendingLabel="…">Refuser</SubmitButton></form>
    {(s1?.error || s2?.error) && <p className="text-sm text-danger" role="alert">{s1?.error ?? s2?.error}</p>}</div>);
}
export function CreditRequest({ id }: { id: string }) {
  return <DialogForm label="Demander un crédit au DG" title="Demande de crédit" action={A.creditAction.bind(null, id)} submit="Envoyer au Directeur général">
    <p className="text-sm">Le patient ne peut pas régler la totalité. Seul le Directeur général peut accepter qu&apos;il sorte avec une dette.</p>
    <Field label="Motif *" name="reason"><Input name="reason" required /></Field></DialogForm>;
}
export function CreditDecision({ id }: { id: string }) {
  const [s1, approve] = useActionToast(A.decideCreditAction.bind(null, id, true));
  const [s2, reject] = useActionToast(A.decideCreditAction.bind(null, id, false));
  return (<div className="space-y-2">
    <form action={approve} className="flex flex-wrap items-end gap-2" id={`credit-${id}`}>
      <label className="block min-w-48 flex-1"><span className="mb-1 block text-sm">Note de décision</span><input name="note" className="field" /></label>
      <ConfirmSubmit variant="primary" label="Approuver" title="Approuver ce crédit ?" confirmLabel="Approuver" message="Une dette sera enregistrée au nom du patient et sa sortie sera autorisée." />
    </form>
    <form action={reject}><ConfirmSubmit variant="ghost" label="Refuser" title="Refuser ce crédit ?" confirmLabel="Refuser" message="La sortie normale restera bloquée tant que la facture n'est pas réglée." /></form>
    {(s1?.error || s2?.error) && <p className="text-sm text-danger" role="alert">{s1?.error ?? s2?.error}</p>}
  </div>);
}
export function ReversePayment({ invoiceId, paymentId, number }: { invoiceId: string; paymentId: string; number: string }) {
  return <DialogForm variant="ghost" label="Extourner" title={`Extourner le paiement ${number}`} action={A.reversePaymentAction.bind(null, invoiceId, paymentId)} submit="Extourner">
    <p className="text-sm">Le paiement n&apos;est pas supprimé : une écriture négative liée est créée et tracée.</p><Field label="Motif *" name="reason"><Input name="reason" required /></Field></DialogForm>;
}
export function CancelInvoice({ id }: { id: string }) {
  return <DialogForm variant="ghost" label="Annuler la facture" title="Annuler la facture" action={A.cancelInvoiceAction.bind(null, id)} submit="Annuler la facture">
    <p className="text-sm">Possible seulement sans paiement. Les prestations redeviennent facturables.</p><Field label="Motif *" name="reason"><Input name="reason" required /></Field></DialogForm>;
}

type Opt = { id: string; name: string };
const CATS = { CONSULTATION: "Consultation", EXAM: "Examen", LAB: "Analyse", HOSPITALIZATION: "Hospitalisation", MEDICAL_SERVICE: "Prestation médicale", OTHER: "Autre" };
export function TariffForm({ t, specialties }: { t?: { id: string; code: string; name: string; category: string; price: string; currency: string; unit: string; specialtyId: string | null }; specialties: Opt[] }) {
  const [state, action] = useActionToast(A.tariffAction.bind(null, t?.id ?? null));
  return (<form action={action} key={!t && state?.ok ? String(Math.random()) : t?.id ?? "new"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:items-end">
    <Field label="Code *" name="code" state={state}><Input name="code" required defaultValue={t?.code} state={state} /></Field>
    <div className="lg:col-span-2"><Field label="Libellé *" name="name" state={state}><Input name="name" required defaultValue={t?.name} state={state} /></Field></div>
    <Field label="Catégorie *" name="category" state={state}><Select name="category" defaultValue={t?.category ?? "CONSULTATION"} state={state}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
    <Field label="Prix *" name="price" state={state}><Input name="price" required inputMode="decimal" defaultValue={t?.price} state={state} /></Field>
    <Field label="Devise" name="currency" state={state}><Select name="currency" defaultValue={t?.currency ?? "USD"} state={state}><option value="USD">USD</option><option value="CDF">CDF</option></Select></Field>
    <Field label="Unité" name="unit" state={state}><Input name="unit" defaultValue={t?.unit ?? "acte"} state={state} /></Field>
    <div className="lg:col-span-3"><Field label="Spécialité (consultations)" name="specialtyId" state={state}><Select name="specialtyId" defaultValue={t?.specialtyId ?? ""} state={state}><option value="">Toutes</option>{specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field></div>
    <div className="lg:col-span-4 flex items-end gap-2"><SubmitButton variant={t ? "secondary" : "primary"}>{t ? "Enregistrer" : "Ajouter le tarif"}</SubmitButton><div className="flex-1"><FormMessage state={state} /></div></div>
  </form>);
}
export function TariffToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [state, action] = useActionToast(A.tariffToggleAction.bind(null, id, !active));
  return <form action={action}><SubmitButton variant="ghost" pendingLabel="…" aria-label={`${active ? "Retirer" : "Réactiver"} ${name}`}>{active ? "Retirer" : "Réactiver"}</SubmitButton>{state?.error && <span className="text-sm text-danger">{state.error}</span>}</form>;
}

export function SimpleForm({ action, children, submit }: { action: Act; children: ReactNode; submit: string }) {
  const [state, run] = useActionToast(action);
  return <form action={run} key={state?.ok ? String(Math.random()) : "f"} className="space-y-3">{children}<FormMessage state={state} /><SubmitButton variant="secondary">{submit}</SubmitButton></form>;
}
export function ActionButton({ action, label, variant = "secondary" }: { action: Act; label: string; variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const [state, run] = useActionToast(action);
  return <form action={run}><SubmitButton variant={variant} pendingLabel="…">{label}</SubmitButton>{state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}</form>;
}
export const BillingActions = A;
