"use client";
import { useActionState } from "react";
import { resetPasswordAction, setStatusAction, updateAssignmentAction } from "../actions";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";

type Opt = { id: string; name: string };
type Props = { id: string; roleId: string; departmentId: string | null; status: "ACTIVE" | "DISABLED"; isSuperAdmin: boolean; isSelf: boolean; roles: Opt[]; departments: Opt[] };

export function ManageUser(p: Props) {
  const [aState, assign] = useActionState(updateAssignmentAction.bind(null, p.id), undefined);
  const [sState, toggle] = useActionState(setStatusAction.bind(null, p.id, p.status === "ACTIVE" ? "DISABLED" : "ACTIVE"), undefined);
  const [pState, reset] = useActionState(resetPasswordAction.bind(null, p.id), undefined);
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <form action={assign} className="space-y-3">
        <h3 className="font-semibold">Rôle et département</h3>
        <Field label="Rôle" name="roleId" state={aState}>
          <Select name="roleId" defaultValue={p.roleId} disabled={p.isSuperAdmin} state={aState}>{p.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        </Field>
        {p.isSuperAdmin && <input type="hidden" name="roleId" value={p.roleId} />}
        <Field label="Département" name="departmentId" state={aState}>
          <Select name="departmentId" defaultValue={p.departmentId ?? ""} state={aState}><option value="">—</option>{p.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </Field>
        <FormMessage state={aState} />
        <SubmitButton variant="secondary">Enregistrer</SubmitButton>
      </form>

      <form action={reset} className="space-y-3">
        <h3 className="font-semibold">Réinitialiser le mot de passe</h3>
        <Field label="Mot de passe provisoire" name="password" state={pState} hint="L'utilisateur sera déconnecté et devra le changer."><Input name="password" type="text" autoComplete="off" required state={pState} /></Field>
        <FormMessage state={pState} />
        <SubmitButton variant="secondary">Réinitialiser</SubmitButton>
      </form>

      <form action={toggle} className="space-y-3">
        <h3 className="font-semibold">Statut du compte</h3>
        <p className="text-sm text-muted">{p.status === "ACTIVE"
          ? "Désactiver empêche toute connexion et ferme immédiatement les sessions ouvertes. L'historique est conservé."
          : "Le compte est désactivé. Le réactiver permet de nouveau la connexion."}</p>
        <FormMessage state={sState} />
        {!p.isSelf && <SubmitButton variant={p.status === "ACTIVE" ? "danger" : "primary"}>{p.status === "ACTIVE" ? "Désactiver le compte" : "Réactiver le compte"}</SubmitButton>}
      </form>
    </div>
  );
}
