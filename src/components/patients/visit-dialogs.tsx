"use client";
import { useActionToast } from "@/components/ui/toast";
import { useEffect, useState } from "react";
import { LogIn, Send, XCircle } from "lucide-react";
import { cancelVisitAction, orientVisitAction, registerArrivalAction } from "@/app/(app)/patients/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";

export type Opt = { id: string; name: string };

function Targets({ departments, doctors, state, initial }: { departments: Opt[]; doctors: Opt[]; state?: { field?: string; error?: string }; initial?: { departmentId?: string | null; doctorId?: string | null } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Service" name="departmentId" state={state} hint={departments.length ? undefined : "Aucun service configuré."}>
        <Select name="departmentId" defaultValue={initial?.departmentId ?? ""} state={state}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      </Field>
      <Field label="Médecin" name="doctorId" state={state} hint={doctors.length ? undefined : "Aucun médecin enregistré pour l'instant."}>
        <Select name="doctorId" defaultValue={initial?.doctorId ?? ""} state={state}><option value="">—</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      </Field>
    </div>
  );
}

export function ArrivalButton({ patientId, departments, doctors, appointments = [] }: { patientId: string; departments: Opt[]; doctors: Opt[]; appointments?: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(registerArrivalAction.bind(null, patientId), undefined);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  return (
    <>
      <Button onClick={() => setOpen(true)}><LogIn className="size-4" />Enregistrer l'arrivée</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Arrivée du patient">
        <form action={action} className="space-y-4">
          {appointments.length > 0 && (
            <Field label="Arrivée sur rendez-vous" name="appointmentId" state={state} hint="Le médecin du rendez-vous est repris automatiquement.">
              <Select name="appointmentId" defaultValue={appointments[0].id} state={state}><option value="">Sans rendez-vous</option>{appointments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            </Field>
          )}
          <Field label="Motif de la visite" name="reason" state={state}><Input name="reason" placeholder="Ex. : consultation, contrôle…" state={state} /></Field>
          <Targets departments={departments} doctors={doctors} state={state} />
          <p className="text-xs text-muted">L'orientation peut aussi être faite plus tard depuis la file d'attente.</p>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="priority" className="checkbox" />Situation urgente (placée en tête de file)</label>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><SubmitButton>Enregistrer</SubmitButton></div>
        </form>
      </Dialog>
    </>
  );
}

export function OrientButton({ visitId, patientName, departments, doctors, initial }: { visitId: string; patientName: string; departments: Opt[]; doctors: Opt[]; initial: { departmentId: string | null; doctorId: string | null } }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(orientVisitAction.bind(null, visitId), undefined);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-label={`Orienter ${patientName}`}><Send className="size-4" />Orienter</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Orienter ${patientName}`}>
        <form action={action} className="space-y-4">
          <Targets departments={departments} doctors={doctors} state={state} initial={initial} />
          <FormMessage state={state} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><SubmitButton>Orienter</SubmitButton></div>
        </form>
      </Dialog>
    </>
  );
}

export function CancelVisitButton({ visitId, patientName }: { visitId: string; patientName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(cancelVisitAction.bind(null, visitId), undefined);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-label={`Annuler le passage de ${patientName}`}><XCircle className="size-4" />Annuler</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Annuler ce passage ?" size="sm">
        <form action={action} className="space-y-4">
          <p className="text-sm">Le passage de <strong>{patientName}</strong> sera retiré de la file. Le dossier n'est pas modifié et l'annulation reste visible dans l'historique.</p>
          <Field label="Motif *" name="reason" state={state}><Input name="reason" required placeholder="Ex. : patient reparti" state={state} /></Field>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Retour</Button><SubmitButton variant="danger">Annuler le passage</SubmitButton></div>
        </form>
      </Dialog>
    </>
  );
}
