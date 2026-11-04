"use client";
import { useEffect, useState } from "react";
import { BedDouble, LogOut } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import { admitAction, assignBedAction, bedAction, bedServiceAction, dischargeAction, maternityAction, newbornAction, noteAction, roomAction, stayChargeAction } from "@/app/(app)/hospitalisation/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import type { FieldDef } from "./consultation-editor";
import type { FormContext } from "@prisma/client";

type Opt = { id: string; name: string };

export function AdmitButton({ patientId, visitId, beds, label = "Hospitaliser" }: { patientId: string; visitId?: string; beds: Opt[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(admitAction);
  return (<>
    <Button variant="secondary" onClick={() => setOpen(true)}><BedDouble className="size-4" />{label}</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Admission">
      <form action={action} className="space-y-4">
        <input type="hidden" name="patientId" value={patientId} />{visitId && <input type="hidden" name="visitId" value={visitId} />}
        <Field label="Type *" name="type" state={state}><Select name="type" defaultValue="HOSPITALIZATION" state={state}><option value="EMERGENCY">Urgence</option><option value="HOSPITALIZATION">Hospitalisation</option><option value="MATERNITY">Maternité</option></Select></Field>
        <Field label="Motif" name="reason" state={state}><Input name="reason" state={state} /></Field>
        <Field label="Lit" name="bedId" state={state} hint={beds.length ? "Peut aussi être attribué plus tard par le service." : "Aucun lit disponible pour l'instant : le service l'attribuera."}>
          <Select name="bedId" defaultValue="" state={state}><option value="">À attribuer par le service</option>{beds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        </Field>
        <FormMessage state={state} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><SubmitButton>Admettre</SubmitButton></div>
      </form>
    </Dialog>
  </>);
}

export function AssignBed({ id, beds, current }: { id: string; beds: Opt[]; current: boolean }) {
  const [state, action] = useActionToast(assignBedAction.bind(null, id));
  return (<form action={action} className="flex flex-wrap items-end gap-2">
    <div className="min-w-48 flex-1"><Field label={current ? "Transférer vers" : "Attribuer un lit"} name="bedId" state={state}>
      <Select name="bedId" required defaultValue="" state={state}><option value="">{beds.length ? "Choisir un lit disponible…" : "Aucun lit disponible"}</option>{beds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field></div>
    <SubmitButton variant="secondary" disabled={!beds.length}>{current ? "Transférer" : "Attribuer"}</SubmitButton>
    <div className="w-full"><FormMessage state={state} /></div>
  </form>);
}

export function NoteForm({ id }: { id: string }) {
  const [state, action] = useActionToast(noteAction.bind(null, id));
  return (<form action={action} key={state?.ok ? String(Math.random()) : "n"} className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
      <Field label="Type" name="kind" state={state}><Select name="kind" defaultValue="Observation" state={state}>{["Observation", "Soins", "Constantes", "Traitement administré", "Transfert", "Autre"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
      <Field label="Note *" name="content" state={state}><Textarea name="content" required rows={2} state={state} /></Field>
    </div>
    <FormMessage state={state} /><SubmitButton variant="secondary">Ajouter la note</SubmitButton>
  </form>);
}

export function MaternityForm({ id, context, label, fields }: { id: string; context: FormContext; label: string; fields: FieldDef[] }) {
  const [state, action] = useActionToast(maternityAction.bind(null, id, context));
  return (<form action={action} key={state?.ok ? String(Math.random()) : context} className="space-y-3">
    <p className="text-sm font-medium">{label}</p>
    {fields.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{fields.map((f) => (
      f.type === "checkbox" ? <label key={f.key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name={`f_${f.key}`} className="checkbox" />{f.label}</label>
        : <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}${f.required ? " *" : ""}`} name={`f_${f.key}`} state={state}>
          {f.type === "select" ? <Select name={`f_${f.key}`} defaultValue="" state={state}><option value="">—</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</Select>
            : f.type === "textarea" ? <Textarea name={`f_${f.key}`} state={state} /> : <Input name={`f_${f.key}`} type={f.type === "date" ? "date" : "text"} state={state} />}
        </Field>))}</div>}
    <Field label="Notes" name="notes" state={state}><Textarea name="notes" rows={2} state={state} /></Field>
    <FormMessage state={state} /><SubmitButton variant="secondary">Enregistrer la fiche</SubmitButton>
  </form>);
}

export function NewbornForm({ admissionId, deliveryId, canCreateRecord }: { admissionId: string; deliveryId: string; canCreateRecord: boolean }) {
  const [state, action] = useActionToast(newbornAction.bind(null, admissionId, deliveryId));
  return (<form action={action} key={state?.ok ? String(Math.random()) : "nb"} className="mt-3 space-y-3 rounded-xl border border-dashed border-white/25 p-3">
    <p className="text-sm font-medium">Enregistrer un nouveau-né</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Prénom" name="firstName" state={state}><Input name="firstName" state={state} /></Field>
      <Field label="Sexe" name="sex" state={state}><Select name="sex" defaultValue="" state={state}><option value="">—</option><option value="F">Féminin</option><option value="M">Masculin</option></Select></Field>
      <Field label="Notes" name="notes" state={state}><Input name="notes" state={state} /></Field>
    </div>
    {canCreateRecord && <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="createRecord" className="checkbox" defaultChecked />Créer son propre dossier patient</label>}
    <FormMessage state={state} /><SubmitButton variant="secondary">Enregistrer le nouveau-né</SubmitButton>
  </form>);
}

export function DischargeForm({ id, blocked }: { id: string; blocked: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(dischargeAction.bind(null, id));
  const [sState, stay] = useActionToast(stayChargeAction.bind(null, id));
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  return (<div className="flex flex-wrap gap-2">
    <form action={stay}><SubmitButton variant="secondary" pendingLabel="Calcul…">Mettre à jour les frais de séjour</SubmitButton>{sState?.error && <p className="text-sm text-danger">{sState.error}</p>}</form>
    <Button onClick={() => setOpen(true)}><LogOut className="size-4" />Sortie du patient</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Sortie du patient">
      <form action={action} className="space-y-4">
        {blocked && <p role="note" className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-[#ffe7b3]">{blocked}</p>}
        <Field label="Notes de sortie" name="notes" state={state}><Textarea name="notes" state={state} /></Field>
        <FormMessage state={state} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><SubmitButton>Confirmer la sortie</SubmitButton></div>
      </form>
    </Dialog>
  </div>);
}

export function RoomForm({ departments }: { departments: Opt[] }) {
  const [state, action] = useActionToast(roomAction);
  return (<form action={action} key={state?.ok ? String(Math.random()) : "room"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
    <Field label="Code *" name="code" state={state}><Input name="code" required state={state} /></Field>
    <Field label="Nom *" name="name" state={state}><Input name="name" required state={state} /></Field>
    <Field label="Catégorie *" name="category" state={state} hint="Ex. : commune, privée, maternité…"><Input name="category" required state={state} /></Field>
    <Field label="Service" name="departmentId" state={state}><Select name="departmentId" defaultValue="" state={state}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
    <SubmitButton>Créer la chambre</SubmitButton>
    <div className="sm:col-span-2 lg:col-span-5"><FormMessage state={state} /></div>
  </form>);
}
export function BedForm({ roomId, roomCode }: { roomId: string; roomCode: string }) {
  const [state, action] = useActionToast(bedAction.bind(null, roomId));
  return (<form action={action} key={state?.ok ? String(Math.random()) : roomId} className="flex flex-wrap items-start gap-2">
    <input name="code" required placeholder="Code du lit" aria-label={`Nouveau lit dans ${roomCode}`} className="field !w-36" />
    <SubmitButton variant="secondary" pendingLabel="…">Ajouter un lit</SubmitButton>
    {state?.error && <p className="w-full text-sm text-danger" role="alert">{state.error}</p>}
  </form>);
}
export function BedService({ bedId, out, label }: { bedId: string; out: boolean; label: string }) {
  const [state, action] = useActionToast(bedServiceAction.bind(null, bedId, out));
  return <form action={action}><SubmitButton variant="ghost" pendingLabel="…" aria-label={`${out ? "Mettre hors service" : "Remettre en service"} ${label}`} className="!min-h-9 !px-2 text-xs">{out ? "Hors service" : "Remettre en service"}</SubmitButton>{state?.error && <span className="text-xs text-danger">{state.error}</span>}</form>;
}
