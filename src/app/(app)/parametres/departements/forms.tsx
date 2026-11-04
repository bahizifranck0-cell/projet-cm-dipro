"use client";
import { useActionToast } from "@/components/ui/toast";

import { createDepartmentAction, renameDepartmentAction, toggleDepartmentAction } from "./actions";
import { FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";

export function NewDepartment() {
  const [state, action] = useActionToast(createDepartmentAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="name" placeholder="Nom du département" required aria-label="Nom du département" state={state} />
        <SubmitButton className="shrink-0">Ajouter</SubmitButton>
      </div>
      {state?.field ? <p className="text-sm text-danger" role="alert">{state.error}</p> : <FormMessage state={state} />}
    </form>
  );
}

export function DepartmentRow({ id, name, active, canEdit, counts }: { id: string; name: string; active: boolean; canEdit: boolean; counts: string }) {
  const [rState, rename] = useActionToast(renameDepartmentAction.bind(null, id), undefined);
  const [tState, toggle] = useActionToast(toggleDepartmentAction.bind(null, id, !active), undefined);
  if (!canEdit) return <div className="py-3"><p className="font-medium">{name}</p><p className="text-xs text-muted">{counts}</p></div>;
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <form action={rename} className="flex flex-1 gap-2">
        <Input name="name" defaultValue={name} required aria-label={`Nom : ${name}`} state={rState} />
        <SubmitButton variant="secondary" className="shrink-0" pendingLabel="…">Renommer</SubmitButton>
      </form>
      <span className="text-xs text-muted sm:w-40">{counts}</span>
      <form action={toggle}><SubmitButton variant={active ? "ghost" : "primary"} className="w-full sm:w-auto" pendingLabel="…">{active ? "Désactiver" : "Réactiver"}</SubmitButton></form>
      {(rState?.error || tState?.error) && <p className="text-sm text-danger" role="alert">{rState?.error ?? tState?.error}</p>}
    </div>
  );
}
