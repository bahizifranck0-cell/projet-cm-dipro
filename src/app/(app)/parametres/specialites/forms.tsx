"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import { assignDoctorAction, createSpecialtyAction, endAssignmentAction, saveFormAction, toggleSpecialtyAction, updateSpecialtyAction } from "./actions";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/card";

type Opt = { id: string; name: string };
const TYPES = { text: "Texte court", textarea: "Texte long", number: "Nombre", select: "Liste de choix", checkbox: "Case à cocher", date: "Date" } as const;
type F = { key: string; label: string; type: keyof typeof TYPES; options?: string[]; required?: boolean; unit?: string };

export function SpecialtyForm({ id, initial, departments }: { id?: string; initial?: { name: string; description: string | null; confidential: boolean; departmentIds: string[] }; departments: Opt[] }) {
  const [state, action] = useActionToast(id ? updateSpecialtyAction.bind(null, id) : createSpecialtyAction);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom de la spécialité *" name="name" state={state}><Input name="name" required defaultValue={initial?.name} state={state} /></Field>
        <Field label="Description" name="description" state={state}><Input name="description" defaultValue={initial?.description ?? ""} state={state} /></Field>
      </div>
      {departments.length > 0 && (
        <fieldset><legend className="mb-2 text-sm font-medium">Services associés</legend>
          <div className="flex flex-wrap gap-2">{departments.map((d) => (
            <label key={d.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm"><input type="checkbox" name="departmentIds" value={d.id} defaultChecked={initial?.departmentIds.includes(d.id)} className="checkbox" />{d.name}</label>
          ))}</div>
        </fieldset>
      )}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confidential" defaultChecked={initial?.confidential} className="checkbox mt-0.5" />
        <span>Spécialité confidentielle<span className="block text-xs text-muted">Le contenu des consultations n'est visible que par leur auteur et les médecins de la même spécialité (ex. psychologie).</span></span></label>
      <FormMessage state={state} />
      <SubmitButton>{id ? "Enregistrer" : "Créer la spécialité"}</SubmitButton>
    </form>
  );
}

export function ToggleSpecialty({ id, active }: { id: string; active: boolean }) {
  const [state, action] = useActionToast(toggleSpecialtyAction.bind(null, id, !active));
  return (
    <form action={action} className="space-y-2">
      <FormMessage state={state} />
      {active ? <ConfirmSubmit label="Désactiver la spécialité" title="Désactiver cette spécialité ?" confirmLabel="Désactiver" message="Plus aucune nouvelle consultation ne pourra être ouverte dans cette spécialité. Les anciens dossiers ne sont pas touchés." />
        : <SubmitButton>Réactiver la spécialité</SubmitButton>}
    </form>
  );
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "champ";

/** Constructeur de formulaire : chaque enregistrement crée une nouvelle version. */
export function FormBuilder({ specialtyId, context = "CONSULTATION", initial, validated, version }: { specialtyId: string | null; context?: Parameters<typeof saveFormAction>[1]; initial: F[]; validated: boolean; version: number | null }) {
  const [state, action] = useActionToast(saveFormAction.bind(null, specialtyId, context));
  const [fields, setFields] = useState<F[]>(initial);
  const [draft, setDraft] = useState<{ label: string; type: F["type"]; options: string; required: boolean; unit: string }>({ label: "", type: "text", options: "", required: false, unit: "" });
  const add = () => {
    if (!draft.label.trim()) return;
    let key = slug(draft.label); let n = 2;
    while (fields.some((f) => f.key === key)) key = `${slug(draft.label)}_${n++}`;
    setFields([...fields, { key, label: draft.label.trim(), type: draft.type, required: draft.required || undefined, unit: draft.unit.trim() || undefined,
      options: draft.type === "select" ? draft.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined }]);
    setDraft({ label: "", type: "text", options: "", required: false, unit: "" });
  };
  const move = (i: number, d: number) => { const n = [...fields]; [n[i], n[i + d]] = [n[i + d], n[i]]; setFields(n); };
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">{version ? `Version actuelle : ${version}.` : "Aucun formulaire spécifique pour l'instant."} Les champs ajoutés ici s'affichent en plus des champs communs.</p>
      {!validated && fields.length > 0 && <Alert tone="warning" title="À valider par les professionnels de santé">Ce formulaire n'a pas encore été validé par les médecins de la spécialité.</Alert>}
      {fields.length > 0 && (
        <ol className="space-y-2">
          {fields.map((f, i) => (
            <li key={f.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-3">
              <span className="min-w-0 flex-1"><span className="font-medium">{f.label}</span>{f.required && <span className="text-danger"> *</span>}
                <span className="block text-xs text-muted">{TYPES[f.type]}{f.unit ? ` (${f.unit})` : ""}{f.options ? ` : ${f.options.join(", ")}` : ""}</span></span>
              <Button type="button" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Monter ${f.label}`}><ArrowUp className="size-4" /></Button>
              <Button type="button" variant="ghost" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre ${f.label}`}><ArrowDown className="size-4" /></Button>
              <Button type="button" variant="ghost" onClick={() => setFields(fields.filter((_, j) => j !== i))} aria-label={`Retirer ${f.label}`}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ol>
      )}
      <fieldset className="grid gap-3 rounded-xl border border-dashed border-white/25 p-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <legend className="px-1 text-sm font-medium">Ajouter un champ</legend>
        <label className="block lg:col-span-2"><span className="mb-1 block text-sm">Libellé</span><input className="field" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-sm">Type</span><select className="field" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as F["type"] })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {draft.type === "select"
          ? <label className="block"><span className="mb-1 block text-sm">Choix (séparés par des virgules)</span><input className="field" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} /></label>
          : <label className="block"><span className="mb-1 block text-sm">Unité</span><input className="field" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></label>}
        <div className="flex items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />Obligatoire</label>
          <Button type="button" variant="secondary" onClick={add} disabled={!draft.label.trim()}><Plus className="size-4" />Ajouter</Button>
        </div>
      </fieldset>
      <input type="hidden" name="fields" value={JSON.stringify(fields)} />
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="validated" defaultChecked={validated} className="checkbox" />Formulaire validé par les professionnels de santé</label>
      <FormMessage state={state} />
      <SubmitButton>Enregistrer une nouvelle version</SubmitButton>
    </form>
  );
}

export function AssignDoctor({ specialtyId, employees, departments }: { specialtyId: string; employees: Opt[]; departments: Opt[] }) {
  const [state, action] = useActionToast(assignDoctorAction.bind(null, specialtyId));
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Médecin" name="employeeId" state={state}><Select name="employeeId" required defaultValue="" state={state}><option value="">Choisir…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
      <Field label="Service (facultatif)" name="departmentId" state={state}><Select name="departmentId" defaultValue="" state={state}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      <SubmitButton variant="secondary">Affecter</SubmitButton>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}

export function EndAssignment({ specialtyId, assignmentId, name }: { specialtyId: string; assignmentId: string; name: string }) {
  const [state, action] = useActionToast(endAssignmentAction.bind(null, specialtyId, assignmentId));
  return (<form action={action}><FormMessage state={state} />
    <ConfirmSubmit variant="ghost" label="Terminer l'affectation" title={`Terminer l'affectation de ${name} ?`} confirmLabel="Terminer" message="Le médecin ne pourra plus ouvrir de consultation dans cette spécialité. Ses consultations passées sont conservées." /></form>);
}
