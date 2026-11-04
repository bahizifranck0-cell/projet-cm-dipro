"use client";
import { useEffect, useState } from "react";
import { CalendarPlus, CalendarClock, XCircle } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import { cancelAppointmentAction, createAppointmentAction, missedAction, rescheduleAction } from "@/app/(app)/consultations/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";

type Opt = { id: string; name: string };
const local = (d = new Date(Date.now() + 86400e3)) => new Date(d.getTime() + 2 * 3600e3).toISOString().slice(0, 16);

export function NewAppointment({ patientId, patientName, doctors, specialties, defaultDoctorId, consultationId }:
  { patientId: string; patientName: string; doctors: Opt[]; specialties: Opt[]; defaultDoctorId?: string | null; consultationId?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(createAppointmentAction);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  return (<>
    <Button variant="secondary" onClick={() => setOpen(true)}><CalendarPlus className="size-4" />Nouveau rendez-vous</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Rendez-vous — ${patientName}`}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="patientId" value={patientId} />{consultationId && <input type="hidden" name="consultationId" value={consultationId} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Médecin *" name="doctorId" state={state}><Select name="doctorId" required defaultValue={defaultDoctorId ?? ""} state={state}><option value="">Choisir…</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Spécialité" name="specialtyId" state={state}><Select name="specialtyId" defaultValue="" state={state}><option value="">—</option>{specialties.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        </div>
        <Field label="Date et heure *" name="scheduledAt" state={state}><Input name="scheduledAt" type="datetime-local" required defaultValue={local()} state={state} /></Field>
        <Field label="Motif *" name="reason" state={state}><Input name="reason" required state={state} /></Field>
        <Field label="Informations complémentaires" name="notes" state={state}><Textarea name="notes" state={state} /></Field>
        <FormMessage state={state} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><SubmitButton>Enregistrer</SubmitButton></div>
      </form>
    </Dialog>
  </>);
}

export function AppointmentActions({ id, label }: { id: string; label: string }) {
  const [mode, setMode] = useState<null | "move" | "cancel">(null);
  const [mState, move] = useActionToast(rescheduleAction.bind(null, id));
  const [cState, cancel] = useActionToast(cancelAppointmentAction.bind(null, id));
  const [xState, missed] = useActionToast(missedAction.bind(null, id));
  useEffect(() => { if (mState?.ok || cState?.ok) setMode(null); }, [mState, cState]);
  return (<div className="flex flex-wrap gap-2">
    <Button variant="secondary" onClick={() => setMode("move")} aria-label={`Reporter ${label}`}><CalendarClock className="size-4" />Reporter</Button>
    <Button variant="ghost" onClick={() => setMode("cancel")} aria-label={`Annuler ${label}`}><XCircle className="size-4" />Annuler</Button>
    <form action={missed}><SubmitButton variant="ghost" pendingLabel="…" aria-label={`Marquer ${label} comme manqué`}>Manqué</SubmitButton></form>
    {xState?.error && <p className="text-sm text-danger">{xState.error}</p>}
    <Dialog open={mode === "move"} onClose={() => setMode(null)} title="Reporter le rendez-vous" size="sm">
      <form action={move} className="space-y-4">
        <Field label="Nouvelle date et heure *" name="scheduledAt" state={mState}><Input name="scheduledAt" type="datetime-local" required defaultValue={local()} state={mState} /></Field>
        <Field label="Motif du report" name="reason" state={mState}><Input name="reason" state={mState} /></Field>
        <FormMessage state={mState} /><div className="flex justify-end"><SubmitButton>Reporter</SubmitButton></div>
      </form>
    </Dialog>
    <Dialog open={mode === "cancel"} onClose={() => setMode(null)} title="Annuler le rendez-vous" size="sm">
      <form action={cancel} className="space-y-4">
        <Field label="Motif *" name="reason" state={cState}><Input name="reason" required state={cState} /></Field>
        <FormMessage state={cState} /><div className="flex justify-end"><SubmitButton variant="danger">Annuler le rendez-vous</SubmitButton></div>
      </form>
    </Dialog>
  </div>);
}
