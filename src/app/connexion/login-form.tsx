"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { loginAction } from "./actions";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Identifiant</span>
        <input name="username" autoComplete="username" required autoCapitalize="none" spellCheck={false} className="field" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Mot de passe</span>
        <span className="relative block">
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required className="field pr-12" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={show}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted hover:text-ink">
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="w-full py-3 text-base" pendingLabel="Connexion…"><LogIn className="size-5" />Se connecter</SubmitButton>
    </form>
  );
}
