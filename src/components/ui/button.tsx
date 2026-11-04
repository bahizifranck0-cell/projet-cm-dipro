"use client";
import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { buttonClass, type Variant } from "./button-class";
export { buttonClass };

export function Button({ variant = "primary", className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...rest}>{children}</button>;
}

/** Bouton d'envoi de formulaire : affiche un état de chargement et empêche le double envoi. */
export function SubmitButton({ children, variant = "primary", className = "", pendingLabel = "Enregistrement…", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pendingLabel?: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || rest.disabled} aria-busy={pending} className={buttonClass(variant, className)} {...rest}>
      {pending ? <><Loader2 className="size-4 animate-spin" aria-hidden />{pendingLabel}</> : children}
    </button>
  );
}
