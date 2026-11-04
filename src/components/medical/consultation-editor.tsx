"use client";
import { useState } from "react";
import { Plus, Save, Trash2, PenLine } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import { addPrescriptionAction, referAction, removePrescriptionAction, saveConsultationAction } from "@/app/(app)/consultations/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";

export type FieldDef = { key: string; label: string; type: "text" | "textarea" | "number" | "select" | "checkbox" | "date"; options?: string[]; required?: boolean; unit?: string };
type Opt = { id: string; name: string };

function DynamicField({ f, value, state }: { f: FieldDef; value: unknown; state?: { field?: string; error?: string } }) {
  const name = `f_${f.key}`;
  const label = `${f.label}${f.unit ? ` (${f.unit})` : ""}${f.required ? " *" : ""}`;
  if (f.type === "checkbox") return <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name={name} defaultChecked={value === true} className="checkbox" />{label}</label>;
  return (
    <Field label={label} name={name} state={state}>
      {f.type === "textarea" ? <Textarea name={name} defaultValue={String(value ?? "")} state={state} />
        : f.type === "select" ? <Select name={name} defaultValue={String(value ?? "")} state={state}><option value="">—</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</Select>
        : <Input name={name} type={f.type === "number" ? "text" : f.type} inputMode={f.type === "number" ? "decimal" : undefined} defaultValue={String(value ?? "")} state={state} />}
    </Field>
  );
}

export function ConsultationEditor({ id, fields, formData, values, specialtyName }: { id: string; fields: FieldDef[]; formData: Record<string, unknown>; values: { observations: string; diagnosis: string; treatment: string; patientVisible: boolean }; specialtyName: string }) {
  const [state, action] = useActionToast(saveConsultationAction.bind(null, id));
  const [sign, setSign] = useState(false);
  return (
    <form action={action} className="space-y-5">
      {fields.length > 0 && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-semibold">Examen — {specialtyName}</legend>
          {fields.map((f) => <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}><DynamicField f={f} value={formData[f.key]} state={state} /></div>)}
        </fieldset>
      )}
      <Field label="Observations" name="observations" state={state}><Textarea name="observations" defaultValue={values.observations} rows={4} state={state} /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Diagnostic" name="diagnosis" state={state}><Textarea name="diagnosis" defaultValue={values.diagnosis} state={state} /></Field>
        <Field label="Traitement / conduite à tenir" name="treatment" state={state}><Textarea name="treatment" defaultValue={values.treatment} state={state} /></Field>
      </div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="patientVisible" defaultChecked={values.patientVisible} className="checkbox mt-0.5" />
        <span>Diagnostic et traitement communicables au patient<span className="block text-xs text-muted">Affichés dans son portail. Les observations restent internes.</span></span></label>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="secondary" name="intent" value="save"><Save className="size-4" />Enregistrer le brouillon</SubmitButton>
        <Button type="button" onClick={() => setSign(true)}><PenLine className="size-4" />Signer la consultation</Button>
      </div>
      <Dialog open={sign} onClose={() => setSign(false)} title="Signer la consultation ?" size="sm"
        footer={<><Button type="button" variant="secondary" onClick={() => setSign(false)}>Retour</Button><SubmitButton name="intent" value="sign" onClick={() => setTimeout(() => setSign(false), 0)}>Signer</SubmitButton></>}>
        <p className="text-sm">Une consultation signée ne peut plus être modifiée. Les ordonnances seront éditées en PDF et le tarif de consultation appliqué automatiquement.</p>
        <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" name="closeVisit" defaultChecked className="checkbox" />Terminer le passage du patient (sauf orientation vers un confrère)</label>
      </Dialog>
    </form>
  );
}

export function PrescriptionForm({ id }: { id: string }) {
  const [state, action] = useActionToast(addPrescriptionAction.bind(null, id));
  const [rows, setRows] = useState(1);
  return (
    <form action={action} key={state?.ok ? Math.random() : "rx"} className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-white/15 p-3 sm:grid-cols-4">
          <label className="block sm:col-span-4 lg:col-span-1"><span className="mb-1 block text-sm">Médicament {i + 1}</span><input name="medication" className="field" required={i === 0} /></label>
          <label className="block"><span className="mb-1 block text-sm">Posologie</span><input name="dosage" className="field" /></label>
          <label className="block"><span className="mb-1 block text-sm">Fréquence</span><input name="frequency" className="field" /></label>
          <label className="block"><span className="mb-1 block text-sm">Durée</span><input name="duration" className="field" /></label>
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setRows(rows + 1)}><Plus className="size-4" />Ajouter un médicament</Button>
      <Field label="Remarques" name="notes" state={state}><Input name="notes" state={state} /></Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Ajouter l'ordonnance</SubmitButton>
    </form>
  );
}

export function RemovePrescription({ consultationId, id }: { consultationId: string; id: string }) {
  const [state, action] = useActionToast(removePrescriptionAction.bind(null, consultationId, id));
  return <form action={action}><SubmitButton variant="ghost" pendingLabel="…" aria-label="Retirer l'ordonnance"><Trash2 className="size-4" /></SubmitButton>{state?.error && <span className="text-sm text-danger">{state.error}</span>}</form>;
}

export function ReferForm({ id, departments, specialties, doctors }: { id: string; departments: Opt[]; specialties: Opt[]; doctors: Opt[] }) {
  const [state, action] = useActionToast(referAction.bind(null, id));
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Service" name="toDepartmentId" state={state}><Select name="toDepartmentId" defaultValue="" state={state}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Spécialité" name="toSpecialtyId" state={state}><Select name="toSpecialtyId" defaultValue="" state={state}><option value="">—</option>{specialties.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Médecin" name="toDoctorId" state={state}><Select name="toDoctorId" defaultValue="" state={state}><option value="">—</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      </div>
      <Field label="Motif" name="reason" state={state}><Input name="reason" state={state} /></Field>
      <FormMessage state={state} /><SubmitButton variant="secondary">Orienter</SubmitButton>
    </form>
  );
}
