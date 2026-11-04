"use client";
import { useState, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import type { Variant } from "./button-class";

/**
 * Bouton qui demande confirmation dans une fenêtre avant d'envoyer le formulaire parent.
 * Remplace la boîte confirm() du navigateur.
 */
export function ConfirmSubmit({ label, title, message, confirmLabel, variant = "danger", disabled }:
  { label: ReactNode; title: string; message: ReactNode; confirmLabel: string; variant?: Variant; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  return (
    <>
      <Button type="button" variant={variant} disabled={disabled} onClick={(e) => { setForm(e.currentTarget.form); setOpen(true); }}>{label}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="sm"
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
          <Button type="button" variant={variant} onClick={() => { setOpen(false); form?.requestSubmit(); }}>{confirmLabel}</Button>
        </>}>
        <div className="text-sm text-ink/90">{message}</div>
      </Dialog>
    </>
  );
}
