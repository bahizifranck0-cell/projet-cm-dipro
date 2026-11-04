"use client";
import { useActionToast } from "@/components/ui/toast";
import { useState } from "react";
import { savePatientNumberAction } from "./actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";

export function PatientNumberForm({ prefix, padding, withYear, canEdit }: { prefix: string; padding: number; withYear: boolean; canEdit: boolean }) {
  const [state, action] = useActionToast(savePatientNumberAction, undefined);
  const [p, setP] = useState(prefix), [n, setN] = useState(padding), [y, setY] = useState(withYear);
  const example = `${(p || "P").toUpperCase()}${y ? `-${new Date().getFullYear()}` : ""}-${"1".padStart(Math.min(Math.max(n || 5, 3), 8), "0")}`;
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Préfixe" name="patients.numberPrefix" state={state}><Input name="prefix" value={p} onChange={(e) => setP(e.target.value)} maxLength={10} /></Field>
        <Field label="Nombre de chiffres" name="patients.numberPadding" state={state}><Input name="padding" type="number" min={3} max={8} value={n} onChange={(e) => setN(Number(e.target.value))} /></Field>
        <label className="flex items-center gap-3 pt-7 text-sm"><input type="checkbox" name="withYear" className="checkbox" checked={y} onChange={(e) => setY(e.target.checked)} />Inclure l'année</label>
      </fieldset>
      <p className="text-sm">Exemple de numéro : <strong className="font-mono">{example}</strong></p>
      <FormMessage state={state} />
      {canEdit && <SubmitButton>Enregistrer le format</SubmitButton>}
    </form>
  );
}
