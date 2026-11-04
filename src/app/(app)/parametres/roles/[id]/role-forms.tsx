"use client";
import { useActionToast } from "@/components/ui/toast";

import { deleteRoleAction, setRoleActiveAction, updateRoleAction } from "../actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm";

export function RoleForms({ id, name, description, active, deletable, locked }: { id: string; name: string; description: string | null; active: boolean; deletable: boolean; locked: boolean }) {
  const [uState, update] = useActionToast(updateRoleAction.bind(null, id), undefined);
  const [aState, toggle] = useActionToast(setRoleActiveAction.bind(null, id, !active), undefined);
  const [dState, del] = useActionToast(deleteRoleAction.bind(null, id), undefined);
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
            {active
              ? <ConfirmSubmit label="Désactiver le rôle" title="Désactiver ce rôle ?" confirmLabel="Désactiver"
                  message="Tous les utilisateurs de ce rôle perdront immédiatement leurs permissions. Leurs comptes ne sont pas supprimés." />
              : <SubmitButton>Réactiver le rôle</SubmitButton>}
          </form>
          {deletable && (
            <form action={del} className="space-y-2">
              <FormMessage state={dState} />
              <ConfirmSubmit label="Supprimer le rôle" title="Supprimer ce rôle ?" confirmLabel="Supprimer définitivement"
                message="Ce rôle n'est attribué à personne. Sa suppression est définitive et sera inscrite au journal d'audit." />
            </form>
          )}
        </div>
      )}
    </div>
  );
}
