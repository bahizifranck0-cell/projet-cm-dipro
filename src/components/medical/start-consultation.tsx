"use client";
import { Stethoscope } from "lucide-react";
import { useActionToast } from "@/components/ui/toast";
import { startConsultationAction } from "@/app/(app)/consultations/actions";
import { SubmitButton } from "@/components/ui/button";

export function StartConsultation({ visitId, specialties, label, existing }: { visitId: string; specialties: { id: string; name: string }[]; label: string; existing?: string }) {
  const [state, action] = useActionToast(startConsultationAction.bind(null, visitId));
  if (existing) return <a href={`/consultations/${existing}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300/70 bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"><Stethoscope className="size-4" />Reprendre</a>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {specialties.length > 1
        ? <select name="specialtyId" className="field !w-auto" aria-label={`Spécialité pour ${label}`}>{specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        : <input type="hidden" name="specialtyId" value={specialties[0]?.id ?? ""} />}
      <SubmitButton pendingLabel="Ouverture…" aria-label={`Recevoir ${label}`} disabled={!specialties.length}><Stethoscope className="size-4" />Recevoir</SubmitButton>
      {state?.error && <span className="text-sm text-danger" role="alert">{state.error}</span>}
    </form>
  );
}
