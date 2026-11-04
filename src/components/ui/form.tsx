"use client";
import { useEffect, useRef, type InputHTMLAttributes, type ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";
import type { ActionState } from "@/server/actions/result";

export function Field({ label, name, hint, state, children }: { label: string; name: string; hint?: string; state?: ActionState; children: ReactNode }) {
  const err = state?.field === name ? state.error : undefined;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink/90">{label}</span>
      {children}
      {err ? <span className="mt-1 block text-sm text-danger" role="alert">{err}</span> : hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ state, ...p }: InputHTMLAttributes<HTMLInputElement> & { state?: ActionState }) {
  return <input className="field" aria-invalid={state?.field === p.name || undefined} {...p} />;
}
/**
 * Liste de choix. React 19 réinitialise le formulaire après une action serveur ;
 * contrairement aux champs texte, une liste revient alors à sa première option.
 * On restaure donc la dernière valeur connue (celle renvoyée par le serveur).
 */
export function Select({ state, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { state?: ActionState }) {
  const ref = useRef<HTMLSelectElement>(null);
  const latest = useRef(p.defaultValue);
  latest.current = p.defaultValue;
  useEffect(() => {
    const el = ref.current, form = el?.form;
    if (!el || !form || p.value !== undefined) return;
    const restore = () => requestAnimationFrame(() => { if (latest.current !== undefined) el.value = String(latest.current); });
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, [p.value]);
  return <select ref={ref} className="field" aria-invalid={state?.field === p.name || undefined} {...p}>{children}</select>;
}
export function Textarea({ state, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { state?: ActionState }) {
  return <textarea className="field min-h-24" aria-invalid={state?.field === p.name || undefined} {...p} />;
}

/** Message global de résultat d'un formulaire (erreur hors champ, ou succès). */
export function FormMessage({ state }: { state?: ActionState }) {
  if (!state) return null;
  if (state.error && !state.field)
    return <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-[#ffd0d5]"><AlertCircle className="mt-0.5 size-4 shrink-0" />{state.error}</p>;
  return null;
}
