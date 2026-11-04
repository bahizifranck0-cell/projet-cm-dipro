"use client";
import { useActionState } from "react";
import { createEmployeeAction } from "../actions";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";

export function EmployeeForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createEmployeeAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nom *" name="lastName" state={state}><Input name="lastName" required state={state} /></Field>
        <Field label="Post-nom" name="postName" state={state}><Input name="postName" state={state} /></Field>
        <Field label="Prénom *" name="firstName" state={state}><Input name="firstName" required state={state} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Sexe" name="sex" state={state}><Select name="sex" defaultValue="" state={state}><option value="">—</option><option value="F">Féminin</option><option value="M">Masculin</option></Select></Field>
        <Field label="Téléphone" name="phone" state={state}><Input name="phone" type="tel" inputMode="tel" state={state} /></Field>
        <Field label="E-mail" name="email" state={state}><Input name="email" type="email" state={state} /></Field>
      </div>
      <Field label="Adresse" name="address" state={state}><Input name="address" state={state} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fonction *" name="position" state={state}><Input name="position" required state={state} /></Field>
        <Field label="Département" name="departmentId" state={state} hint={departments.length ? undefined : "Aucun département créé pour l'instant."}>
          <Select name="departmentId" defaultValue="" state={state}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </Field>
        <Field label="Matricule" name="matricule" state={state} hint="Laisser vide pour une numérotation automatique."><Input name="matricule" state={state} /></Field>
      </div>
      <Field label="Photo" name="photo" state={state} hint="JPEG, PNG ou WebP — 5 Mo maximum.">
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-ink" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>Enregistrer l'employé</SubmitButton>
    </form>
  );
}
