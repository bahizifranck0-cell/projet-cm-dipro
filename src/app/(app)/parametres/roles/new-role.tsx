"use client";
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createRoleAction } from "./actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { Button, SubmitButton } from "@/components/ui/button";

export function NewRole() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createRoleAction, undefined);
  if (!open) return <Button onClick={() => setOpen(true)}><Plus className="size-4" />Ajouter un rôle</Button>;
  return (
    <form action={action} className="glass w-full space-y-3 rounded-2xl p-4 sm:w-96">
      <Field label="Nom du rôle *" name="name" state={state}><Input name="name" required autoFocus state={state} /></Field>
      <Field label="Description" name="description" state={state}><Input name="description" state={state} /></Field>
      <FormMessage state={state} />
      <div className="flex gap-2"><SubmitButton>Créer</SubmitButton><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button></div>
    </form>
  );
}
