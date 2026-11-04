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
      <div className="hidden xl:grid grid-cols-[minmax(180px,1fr)_repeat(6,84px)_70px] gap-2 border-b border-white/15 px-3 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <span>Module</span>{ACTIONS.map((a) => <span key={a} className="text-center">{ACTION_LABELS[a]}</span>)}<span className="text-center">Tout</span>
      </div>
      <div className="divide-y divide-white/10">
        {MODULES.map((m) => {
          const keys = m.actions.map((a) => `${m.key}.${a}`);
          const allOn = keys.every((k) => checked.has(k));
          return (
            <fieldset key={m.key} className="flex flex-wrap gap-2 px-3 py-3 xl:grid xl:grid-cols-[minmax(180px,1fr)_repeat(6,76px)_64px] xl:items-center">
              <legend className="contents"><span className="w-full font-medium xl:w-auto">{m.label}{"hint" in m && <span className="block text-xs font-normal text-muted">{m.hint}</span>}</span></legend>
              {ACTIONS.map((a) => {
                const k = `${m.key}.${a}`;
                if (!(m.actions as readonly string[]).includes(a)) return <span key={a} className="hidden text-center text-muted/40 xl:block" aria-hidden>—</span>;
                return (
                  <label key={a} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/8 xl:min-h-0 xl:justify-center xl:border-0 xl:p-1">
                    <input type="checkbox" name="perm" value={k} checked={checked.has(k)} onChange={() => toggle(k)} className="checkbox" />
                    <span className="xl:sr-only">{ACTION_LABELS[a]}</span>
                  </label>
                );
              })}
              <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm text-muted xl:min-h-0 xl:justify-center">
                <input type="checkbox" checked={allOn} onChange={() => toggleRow(keys, !allOn)} className="checkbox" aria-label={`Tout cocher : ${m.label}`} />
                <span className="xl:sr-only">Tout</span>
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
