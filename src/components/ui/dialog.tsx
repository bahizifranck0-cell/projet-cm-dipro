"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Fenêtre modale basée sur <dialog> natif : piège le focus, se ferme avec Échap,
 * rend le focus à l'élément d'origine, ne dépasse jamais de l'écran.
 */
export function Dialog({ open, onClose, title, children, footer, size = "md" }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" }[size];
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`glass-strong m-auto w-[calc(100%-2rem)] ${width} max-h-[calc(100dvh-2rem)] rounded-3xl p-0 text-ink backdrop:bg-brand-950/70 backdrop:backdrop-blur-sm`}>
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/12 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="-m-1 rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-ink"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-white/12 px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </dialog>
  );
}
