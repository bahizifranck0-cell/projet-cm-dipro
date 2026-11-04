"use client";
import { useState } from "react";
import { CheckCircle2, FlaskConical, Send } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import { cancelLabAction, labTestAction, labTestToggleAction, requestLabAction, resultsAction, sampleAction, validateAction } from "@/app/(app)/laboratoire/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";

type Test = { id: string; name: string; category: string | null; priced: boolean };
export function LabRequestForm({ consultationId, tests }: { consultationId: string; tests: Test[] }) {
  const [state, action] = useActionToast(requestLabAction.bind(null, consultationId));
  const groups = Object.entries(tests.reduce<Record<string, Test[]>>((g, t) => ((g[t.category ?? "Autres"] ??= []).push(t), g), {}));
  if (!tests.length) return <p className="text-sm text-muted">Le catalogue d'analyses est vide : le laboratoire doit d'abord le compléter.</p>;
  return (
    <form action={action} key={state?.ok ? String(Math.random()) : "lab"} className="space-y-3">
      {groups.map(([g, ts]) => (
        <fieldset key={g}><legend className="mb-1 text-sm font-medium">{g}</legend>
          <div className="flex flex-wrap gap-2">{ts.map((t) => <label key={t.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm"><input type="checkbox" name="tests" value={t.id} className="checkbox" />{t.name}{!t.priced && <span className="text-xs text-muted">(tarif non configuré)</span>}</label>)}</div>
        </fieldset>
      ))}
      <Field label="Renseignements cliniques" name="clinicalInfo" state={state}><Input name="clinicalInfo" state={state} /></Field>
      <FormMessage state={state} /><SubmitButton variant="secondary"><FlaskConical className="size-4" />Envoyer au laboratoire</SubmitButton>
    </form>
  );
}

export function SampleForm({ id, defaultType }: { id: string; defaultType?: string | null }) {
  const [state, action] = useActionToast(sampleAction.bind(null, id));
  return (<form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
    <Field label="Type d'échantillon *" name="sampleType" state={state}><Input name="sampleType" required defaultValue={defaultType ?? ""} state={state} /></Field>
    <Field label="Remarques" name="notes" state={state}><Input name="notes" state={state} /></Field>
    <SubmitButton variant="secondary">Enregistrer le prélèvement</SubmitButton>
    <div className="sm:col-span-3"><FormMessage state={state} /></div>
  </form>);
}

type Item = { id: string; name: string; unit: string | null; referenceRange: string | null; resultValue: string | null; flag: string | null; observation: string | null };
export function ResultsForm({ id, items, conclusion, canSubmit }: { id: string; items: Item[]; conclusion: string | null; canSubmit: boolean }) {
  const [state, action] = useActionToast(resultsAction.bind(null, id));
  return (<form action={action} className="space-y-4">
    {items.map((i) => (
      <fieldset key={i.id} className="grid gap-3 rounded-xl border border-white/15 p-3 sm:grid-cols-[2fr_1fr_2fr]">
        <legend className="px-1 text-sm font-semibold">{i.name}{i.unit && <span className="font-normal text-muted"> ({i.unit})</span>}{i.referenceRange && <span className="block font-normal text-xs text-muted">Référence : {i.referenceRange}</span>}</legend>
        <input type="hidden" name="itemId" value={i.id} />
        <label className="block"><span className="mb-1 block text-sm">Résultat</span><input name={`value_${i.id}`} defaultValue={i.resultValue ?? ""} className="field" /></label>
        <label className="block"><span className="mb-1 block text-sm">Interprétation</span><Select name={`flag_${i.id}`} defaultValue={i.flag ?? ""}><option value="">—</option><option value="normal">Normal</option><option value="bas">Bas</option><option value="élevé">Élevé</option><option value="anormal">Anormal</option></Select></label>
        <label className="block"><span className="mb-1 block text-sm">Observation</span><input name={`obs_${i.id}`} defaultValue={i.observation ?? ""} className="field" /></label>
      </fieldset>
    ))}
    <Field label="Conclusion" name="conclusion" state={state}><Textarea name="conclusion" defaultValue={conclusion ?? ""} state={state} /></Field>
    <FormMessage state={state} />
    <div className="flex flex-wrap gap-2">
      <SubmitButton variant="secondary" name="intent" value="save">Enregistrer</SubmitButton>
      {canSubmit && <SubmitButton name="intent" value="submit"><Send className="size-4" />Soumettre pour validation</SubmitButton>}
    </div>
  </form>);
}

export function ValidateButton({ id }: { id: string }) {
  const [state, action] = useActionToast(validateAction.bind(null, id));
  return (<form action={action} className="space-y-2"><FormMessage state={state} />
    <ConfirmSubmit variant="primary" label={<><CheckCircle2 className="size-4" />Valider les résultats</>} title="Valider ces résultats ?" confirmLabel="Valider"
      message="Le résultat devient officiel : il est rattaché au dossier du patient, un document PDF est créé et le médecin demandeur est notifié. Il ne pourra plus être modifié." /></form>);
}

export function CancelLab({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(cancelLabAction.bind(null, id));
  return (<>
    <Button variant="ghost" onClick={() => setOpen(true)}>Annuler la demande</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Annuler la demande" size="sm">
      <form action={action} className="space-y-3"><Field label="Motif *" name="reason" state={state}><Input name="reason" required state={state} /></Field>
        <FormMessage state={state} /><div className="flex justify-end"><SubmitButton variant="danger">Annuler la demande</SubmitButton></div></form>
    </Dialog>
  </>);
}

type T = { id: string; code: string; name: string; category: string | null; sampleType: string | null; unit: string | null; referenceRange: string | null; tariffItemId: string | null };
export function LabTestForm({ test, tariffs }: { test?: T; tariffs: { id: string; name: string }[] }) {
  const [state, action] = useActionToast(labTestAction.bind(null, test?.id ?? null));
  return (<form action={action} key={!test && state?.ok ? String(Math.random()) : test?.id ?? "new"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Code *" name="code" state={state}><Input name="code" required defaultValue={test?.code} state={state} /></Field>
    <Field label="Nom *" name="name" state={state}><Input name="name" required defaultValue={test?.name} state={state} /></Field>
    <Field label="Catégorie" name="category" state={state}><Input name="category" defaultValue={test?.category ?? ""} state={state} /></Field>
    <Field label="Échantillon" name="sampleType" state={state}><Input name="sampleType" defaultValue={test?.sampleType ?? ""} state={state} /></Field>
    <Field label="Unité" name="unit" state={state}><Input name="unit" defaultValue={test?.unit ?? ""} state={state} /></Field>
    <Field label="Valeurs de référence" name="referenceRange" state={state}><Input name="referenceRange" defaultValue={test?.referenceRange ?? ""} state={state} /></Field>
    <Field label="Tarif (catalogue)" name="tariffItemId" state={state} hint={tariffs.length ? undefined : "Aucun tarif « Analyse » configuré."}>
      <Select name="tariffItemId" defaultValue={test?.tariffItemId ?? ""} state={state}><option value="">Non facturé</option>{tariffs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
    <div className="flex items-end"><SubmitButton variant={test ? "secondary" : "primary"}>{test ? "Enregistrer" : "Ajouter l'analyse"}</SubmitButton></div>
    <div className="sm:col-span-2 lg:col-span-4"><FormMessage state={state} /></div>
  </form>);
}
export function LabTestToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [state, action] = useActionToast(labTestToggleAction.bind(null, id, !active));
  return <form action={action}><SubmitButton variant="ghost" pendingLabel="…" aria-label={`${active ? "Retirer" : "Réactiver"} ${name}`}>{active ? "Retirer" : "Réactiver"}</SubmitButton>{state?.error && <span className="text-sm text-danger">{state.error}</span>}</form>;
}
