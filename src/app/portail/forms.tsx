"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { portalLoginAction, portalPasswordAction } from "./actions";
import { SubmitButton } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";

export function PortalLogin() {
  const [state, action] = useActionState(portalLoginAction, undefined);
  const [show, setShow] = useState(false);
  return (<form action={action} className="space-y-4">
    <label className="block"><span className="mb-1.5 block text-sm font-medium">Identifiant</span><input name="username" required autoComplete="username" autoCapitalize="none" className="field" /></label>
    <label className="block"><span className="mb-1.5 block text-sm font-medium">Mot de passe</span><span className="relative block">
      <input name="password" type={show ? "text" : "password"} required autoComplete="current-password" className="field pr-12" />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={show} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted">{show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></span></label>
    <FormMessage state={state} />
    <SubmitButton className="w-full py-3 text-base" pendingLabel="Connexion…"><LogIn className="size-5" />Accéder à mon dossier</SubmitButton>
  </form>);
}
export function PortalPassword({ forced }: { forced: boolean }) {
  const [state, action] = useActionState(portalPasswordAction, undefined);
  return (<form action={action} className="space-y-4">
    {forced && <p className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-[#ffe7b3]">Votre mot de passe est provisoire : choisissez-en un nouveau.</p>}
    <Field label="Mot de passe actuel" name="current" state={state}><Input name="current" type="password" required autoComplete="current-password" state={state} /></Field>
    <Field label="Nouveau mot de passe" name="next" state={state} hint="Au moins 10 caractères, avec des lettres et des chiffres."><Input name="next" type="password" required autoComplete="new-password" state={state} /></Field>
    <Field label="Confirmer le nouveau mot de passe" name="confirm" state={state}><Input name="confirm" type="password" required autoComplete="new-password" state={state} /></Field>
    <FormMessage state={state} /><SubmitButton>Enregistrer</SubmitButton>
  </form>);
}
