"use client";
import { useActionState, useMemo, useState } from "react";
import { savePermissionsAction } from "../actions";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { ACTIONS, ACTION_LABELS, MODULES } from "@/server/auth/permissions";

export function PermissionMatrix({ roleId, initial }: { roleId: string; initial: string[] }) {
  const [state, action] = useActionState(savePermissionsAction.bind(null, roleId), undefined);
  const [checked, setChecked] = useState(() => new Set(initial));
  const dirty = useMemo(() => checked.size !== initial.length || initial.some((k) => !checked.has(k)), [checked, initial]);
  const toggle = (k: string) => setChecked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleRow = (keys: string[], on: boolean) => setChecked((s) => { const n = new Set(s); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; });

  return (
    <form action={action}>
      <div className="hidden grid-cols-[minmax(180px,1fr)_repeat(6,84px)_70px] gap-2 border-b border-white/15 px-3 pb-2 text-xs font-semibold tracking-wide text-muted uppercase md:grid">
        <span>Module</span>{ACTIONS.map((a) => <span key={a} className="text-center">{ACTION_LABELS[a]}</span>)}<span className="text-center">Tout</span>
      </div>
      <div className="divide-y divide-white/10">
        {MODULES.map((m) => {
          const keys = m.actions.map((a) => `${m.key}.${a}`);
          const allOn = keys.every((k) => checked.has(k));
          return (
            <fieldset key={m.key} className="grid grid-cols-3 gap-2 px-3 py-3 sm:grid-cols-6 md:grid-cols-[minmax(180px,1fr)_repeat(6,84px)_70px] md:items-center">
              <legend className="contents"><span className="col-span-full font-medium md:col-span-1">{m.label}{"hint" in m && <span className="block text-xs font-normal text-muted">{m.hint}</span>}</span></legend>
              {ACTIONS.map((a) => {
                const k = `${m.key}.${a}`;
                if (!(m.actions as readonly string[]).includes(a)) return <span key={a} className="hidden text-center text-muted/40 md:block" aria-hidden>—</span>;
                return (
                  <label key={a} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-2 py-1.5 text-sm hover:bg-white/8 md:justify-center md:border-0 md:p-1">
                    <input type="checkbox" name="perm" value={k} checked={checked.has(k)} onChange={() => toggle(k)} className="checkbox" />
                    <span className="md:sr-only">{ACTION_LABELS[a]}</span>
                  </label>
                );
              })}
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted md:justify-center">
                <input type="checkbox" checked={allOn} onChange={() => toggleRow(keys, !allOn)} className="checkbox" aria-label={`Tout cocher : ${m.label}`} />
                <span className="md:sr-only">Tout</span>
              </label>
            </fieldset>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-4 flex flex-col gap-3 rounded-2xl bg-brand-950/80 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{checked.size} permission{checked.size > 1 ? "s" : ""} cochée{checked.size > 1 ? "s" : ""}{dirty && " — modifications non enregistrées"}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><FormMessage state={state} /><SubmitButton disabled={!dirty}>Enregistrer les permissions</SubmitButton></div>
      </div>
    </form>
  );
}
