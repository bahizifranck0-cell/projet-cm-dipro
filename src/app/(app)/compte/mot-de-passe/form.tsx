"use client";
import Link from "next/link";
import { useActionState } from "react";
import { changePasswordAction } from "./actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton, buttonClass } from "@/components/ui/button";

export function PasswordForm({ forced }: { forced: boolean }) {
  const [state, action] = useActionState(changePasswordAction, undefined);
  if (state?.ok)
    return (<div className="space-y-4"><FormMessage state={state} /><Link href="/" className={buttonClass()}>Continuer</Link></div>);
  return (
    <form action={action} className="space-y-4">
      {forced && <p className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-[#ffe7b3]">Votre mot de passe est provisoire : choisissez-en un nouveau pour accéder au logiciel.</p>}
      <Field label="Mot de passe actuel" name="current" state={state}><Input name="current" type="password" autoComplete="current-password" required state={state} /></Field>
      <Field label="Nouveau mot de passe" name="next" state={state} hint="Au moins 10 caractères, avec des lettres et des chiffres."><Input name="next" type="password" autoComplete="new-password" required state={state} /></Field>
      <Field label="Confirmer le nouveau mot de passe" name="confirm" state={state}><Input name="confirm" type="password" autoComplete="new-password" required state={state} /></Field>
      <FormMessage state={state} />
      <SubmitButton>Enregistrer le mot de passe</SubmitButton>
    </form>
  );
}
