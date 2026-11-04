"use client";
import Link from "next/link";
import { useActionState } from "react";
import { AlertTriangle } from "lucide-react";
import { createPatientAction, updatePatientAction, type CreatePatientState } from "@/app/(app)/patients/actions";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";

type Initial = { lastName?: string; postName?: string | null; firstName?: string; sex?: string | null; birthDate?: string | null; phone?: string | null; address?: string | null };

export function PatientForm({ mode, id, initial = {} }: { mode: "create" | "edit"; id?: string; initial?: Initial }) {
  const action = mode === "create" ? createPatientAction : (updatePatientAction.bind(null, id!) as unknown as typeof createPatientAction);
  const [state, formAction] = useActionState<CreatePatientState, FormData>(action, undefined);
  const dups = state?.duplicates;
  // Après un avertissement de doublon, on garde la saisie : les champs restent contrôlés par le navigateur (defaultValue).
  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nom *" name="lastName" state={state}><Input name="lastName" required defaultValue={initial.lastName} autoComplete="off" state={state} /></Field>
        <Field label="Post-nom" name="postName" state={state}><Input name="postName" defaultValue={initial.postName ?? ""} autoComplete="off" state={state} /></Field>
        <Field label="Prénom *" name="firstName" state={state}><Input name="firstName" required defaultValue={initial.firstName} autoComplete="off" state={state} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Sexe" name="sex" state={state}>
          <Select name="sex" defaultValue={initial.sex ?? ""} state={state}><option value="">—</option><option value="F">Féminin</option><option value="M">Masculin</option></Select>
        </Field>
        <Field label="Date de naissance" name="birthDate" state={state}><Input name="birthDate" type="date" defaultValue={initial.birthDate ?? ""} max={new Date().toISOString().slice(0, 10)} state={state} /></Field>
        <Field label="Téléphone" name="phone" state={state} hint="Ex. : 0991 234 567"><Input name="phone" type="tel" inputMode="tel" defaultValue={initial.phone ?? ""} state={state} /></Field>
      </div>
      <Field label="Adresse" name="address" state={state} hint="Quartier, avenue, commune…"><Input name="address" defaultValue={initial.address ?? ""} state={state} /></Field>

      {dups && dups.length > 0 && (
        <div role="alert" className="space-y-3 rounded-2xl border border-warning/60 bg-warning/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-[#ffe7b3]"><AlertTriangle className="size-5" />Ce patient a peut-être déjà un dossier</p>
          <p className="text-sm text-ink/90">Vérifiez avant de créer un nouveau dossier. Un patient ne doit avoir qu'un seul dossier.</p>
          <ul className="space-y-2">
            {dups.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 rounded-xl border border-white/20 bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{d.name} <span className="text-sm text-muted">· {d.patientNumber}</span></p>
                  <p className="text-sm text-muted">{d.phone ?? "Sans téléphone"} — {d.reasons.join(", ")}</p>
                </div>
                <Link href={`/patients/${d.id}`} className={buttonClass("secondary", "shrink-0")}>Ouvrir ce dossier</Link>
              </li>
            ))}
          </ul>
          <input type="hidden" name="confirmNotDuplicate" value="1" />
          <SubmitButton variant="secondary" pendingLabel="Création…">Ce n'est pas la même personne : créer le dossier</SubmitButton>
        </div>
      )}

      <FormMessage state={state} />
      {!dups?.length && <SubmitButton>{mode === "create" ? "Créer le dossier" : "Enregistrer les modifications"}</SubmitButton>}
    </form>
  );
}
