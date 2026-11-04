"use client";
import { useActionState } from "react";
import { deleteRoleAction, setRoleActiveAction, updateRoleAction } from "../actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";

export function RoleForms({ id, name, description, active, deletable, locked }: { id: string; name: string; description: string | null; active: boolean; deletable: boolean; locked: boolean }) {
  const [uState, update] = useActionState(updateRoleAction.bind(null, id), undefined);
  const [aState, toggle] = useActionState(setRoleActiveAction.bind(null, id, !active), undefined);
  const [dState, del] = useActionState(deleteRoleAction.bind(null, id), undefined);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <form action={update} className="space-y-3">
        <Field label="Nom du rôle" name="name" state={uState}><Input name="name" defaultValue={name} required state={uState} /></Field>
        <Field label="Description" name="description" state={uState}><Input name="description" defaultValue={description ?? ""} state={uState} /></Field>
        <FormMessage state={uState} />
        <SubmitButton variant="secondary">Modifier</SubmitButton>
      </form>
      {!locked && (
        <div className="space-y-3">
          <form action={toggle} className="space-y-2">
            <p className="text-sm text-muted">{active ? "Désactiver retire immédiatement toutes les permissions aux utilisateurs de ce rôle, sans supprimer leurs comptes." : "Ce rôle est désactivé."}</p>
            <FormMessage state={aState} />
            <SubmitButton variant={active ? "danger" : "primary"}>{active ? "Désactiver le rôle" : "Réactiver le rôle"}</SubmitButton>
          </form>
          {deletable && (
            <form action={del} className="space-y-2" onSubmit={(e) => { if (!confirm("Supprimer définitivement ce rôle ?")) e.preventDefault(); }}>
              <FormMessage state={dState} />
              <SubmitButton variant="danger" pendingLabel="Suppression…">Supprimer le rôle</SubmitButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
