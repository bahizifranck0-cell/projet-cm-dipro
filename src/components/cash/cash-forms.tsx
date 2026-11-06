"use client";
// Fenêtres du module Caisse (transfert PREMIDIS : OpenDialog, CloseDialog « Billetage & Clôture », OpDialog).
import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Lock, Ticket, Unlock } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { closeSessionAction, openSessionAction, operationAction } from "@/app/(app)/caisse/session-actions";

const fmt = (v: number, c: string) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;

export function OpenSessionButton({ currency, big }: { currency: string; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, run] = useActionToast(async (s, fd) => { const r = await openSessionAction(currency, s, fd); if (r?.ok) setOpen(false); return r; });
  return (<>
    <Button onClick={() => setOpen(true)} className={big ? "cash-pop" : ""}><Unlock className="size-4" />{big ? "Ouvrir la caisse" : "Ouvrir"}</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Ouverture de caisse (${currency})`} size="sm">
      <form action={run} className="space-y-3">
        <Field label={`Fond de caisse (${currency})`} name="openingFloat" state={state} hint="Montant en caisse au début de la session.">
          <Input name="openingFloat" inputMode="decimal" defaultValue="0" autoFocus state={state} />
        </Field>
        <Field label="Notes" name="notes" state={state}><Input name="notes" state={state} /></Field>
        <FormMessage state={state} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><SubmitButton pendingLabel="Ouverture…"><Unlock className="size-4" />Ouvrir</SubmitButton></div>
      </form>
    </Dialog>
  </>);
}

export function CloseSessionButton({ currency, expected, denominations }: { currency: string; expected: number; denominations: number[] }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [state, run] = useActionToast(async (s, fd) => { const r = await closeSessionAction(currency, s, fd); if (r?.ok) { setOpen(false); setCounts({}); } return r; });
  const total = useMemo(() => denominations.reduce((a, d) => a + d * (Number(counts[d]) || 0), 0), [counts, denominations]);
  const variance = Math.round((total - expected) * 100) / 100;
  const ok = Math.abs(variance) < 0.01;
  return (<>
    <Button variant="secondary" onClick={() => setOpen(true)}><Lock className="size-4" />Clôturer</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Billetage & Clôture" size="md">
      <form action={run} className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-muted"><Ticket className="size-4" aria-hidden />Solde attendu : <strong className="text-ink tabular-nums">{fmt(expected, currency)}</strong></p>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Nombre de billets et pièces par coupure</legend>
          {denominations.map((d) => (
            <label key={d} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2">
              <span className="w-20 shrink-0 text-sm font-semibold tabular-nums">{d.toLocaleString("fr-FR")} {currency === "USD" ? "$" : "FC"}</span>
              <span className="sr-only">Nombre de coupures de {d}</span>
              <input name={`count_${d}`} inputMode="numeric" pattern="[0-9]*" value={counts[d] ?? ""} placeholder="0"
                onChange={(e) => setCounts({ ...counts, [d]: e.target.value.replace(/\D/g, "") })} className="field !py-1.5 min-w-0 flex-1 text-right tabular-nums" />
              <span className="w-24 shrink-0 text-right text-xs text-muted tabular-nums">{fmt(d * (Number(counts[d]) || 0), currency)}</span>
            </label>
          ))}
        </fieldset>
        <Field label="Notes" name="notes" state={state}><Textarea name="notes" rows={2} state={state} /></Field>
        <div className="space-y-1 rounded-2xl border border-white/15 bg-white/6 p-3 text-sm" aria-live="polite">
          <div className="flex justify-between"><span>Compté</span><strong className="tabular-nums">{fmt(total, currency)}</strong></div>
          <div className={`flex justify-between font-semibold ${ok ? "text-success" : "text-danger"}`}><span>Écart</span><span className="tabular-nums">{variance >= 0 ? "+" : ""}{fmt(variance, currency)}</span></div>
        </div>
        <FormMessage state={state} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><SubmitButton pendingLabel="Clôture…"><Lock className="size-4" />Clôturer</SubmitButton></div>
      </form>
    </Dialog>
  </>);
}

export function OperationButtons({ currency, categories, methods }: { currency: string; categories: { IN: Record<string, string>; OUT: Record<string, string> }; methods: Record<string, string> }) {
  const [type, setType] = useState<"IN" | "OUT" | null>(null);
  const [state, run] = useActionToast(async (s, fd) => { const r = await operationAction(type ?? "IN", currency, s, fd); if (r?.ok) setType(null); return r; });
  const cats = type ? categories[type] : {};
  return (<>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setType("IN")} className="cash-lift inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-500/25 px-4 font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.25)] backdrop-blur-md hover:bg-emerald-500/40">
        <ArrowDownCircle className="size-5" aria-hidden />Entrée
      </button>
      <button type="button" onClick={() => setType("OUT")} className="cash-lift inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rose-300/40 bg-rose-500/25 px-4 font-semibold text-white shadow-[0_8px_24px_rgba(244,63,94,0.25)] backdrop-blur-md hover:bg-rose-500/40">
        <ArrowUpCircle className="size-5" aria-hidden />Sortie
      </button>
    </div>
    <Dialog open={type !== null} onClose={() => setType(null)} title={type === "OUT" ? "Sortie caisse (Dépense)" : "Entrée caisse"} size="sm">
      {type && <form action={run} key={type} className="space-y-3">
        <Field label={`Montant (${currency}) *`} name="amount" state={state}><Input name="amount" required inputMode="decimal" autoFocus state={state} /></Field>
        <Field label="Catégorie" name="category" state={state}>
          <Select name="category" defaultValue={Object.keys(cats)[0]} state={state}>{Object.entries(cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Méthode" name="method" state={state}>
          <Select name="method" defaultValue="cash" state={state}>{Object.entries(methods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Description" name="description" state={state}><Input name="description" state={state} /></Field>
        <FormMessage state={state} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setType(null)}>Annuler</Button><SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton></div>
      </form>}
    </Dialog>
  </>);
}
