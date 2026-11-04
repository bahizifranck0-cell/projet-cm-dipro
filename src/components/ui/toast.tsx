"use client";
import { createContext, useActionState, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { ActionState } from "@/server/actions/result";

type Tone = "success" | "error" | "info";
type Toast = { id: number; tone: Tone; text: string };
const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});

/** Messages éphémères (confirmation d'opération). Annoncés aux lecteurs d'écran. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const remove = (id: number) => setItems((l) => l.filter((t) => t.id !== id));
  const push = useCallback((text: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-2), { id, tone, text }]);
    setTimeout(() => remove(id), tone === "error" ? 8000 : 4500);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  const tones = { success: "border-success/60", error: "border-danger/70", info: "border-brand-300/60" };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] flex flex-col items-center gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:items-end">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={`glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl ${tones[t.tone]}`}>
              <I className="mt-0.5 size-5 shrink-0" aria-hidden /><span className="flex-1">{t.text}</span>
              <button onClick={() => remove(t.id)} aria-label="Fermer le message" className="-m-1 rounded p-1 text-muted hover:text-ink"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);

/**
 * Comme useActionState, mais la notification de réussite part dès la réponse du serveur :
 * elle s'affiche même si le formulaire disparaît ensuite de la page (ex. élément retiré d'une liste).
 */
export function useActionToast(action: (state: ActionState, fd: FormData) => Promise<ActionState>, initial: ActionState = undefined) {
  const toast = useToast();
  return useActionState<ActionState, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    if (r?.ok && r.message) toast(r.message);
    return r;
  }, initial);
}
