"use client";
import { useActionState, useState } from "react";
import { createUserAction } from "../actions";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";

type Emp = { id: string; name: string; matricule: string; position: string; departmentId: string | null; departmentName: string | null; hasPhoto: boolean };
type Opt = { id: string; name: string };

export function UserForm({ employees, roles, departments }: { employees: Emp[]; roles: Opt[]; departments: Opt[] }) {
  const [state, action] = useActionState(createUserAction, undefined);
  const [empId, setEmpId] = useState("");
  const emp = employees.find((e) => e.id === empId);
  return (
    <form action={action} className="space-y-5">
      <Field label="Employé *" name="employeeId" state={state} hint="Le compte est rattaché au dossier existant : aucun second dossier n'est créé.">
        <Select name="employeeId" required value={empId} onChange={(e) => setEmpId(e.target.value)} state={state}>
          <option value="">Choisir un employé…</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.matricule}</option>)}
        </Select>
      </Field>
      {emp && (
        <div className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/5 p-3">
          <Avatar employeeId={emp.id} hasPhoto={emp.hasPhoto} name={emp.name} size={56} />
          <div><p className="font-semibold">{emp.name}</p><p className="text-sm text-muted">{emp.position}{emp.departmentName ? ` · ${emp.departmentName}` : ""}</p></div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Identifiant de connexion *" name="username" state={state} hint="Ex. : marie.kahindo"><Input name="username" required autoCapitalize="none" spellCheck={false} state={state} /></Field>
        <Field label="Mot de passe provisoire *" name="password" state={state} hint="10 caractères min. À changer à la première connexion."><Input name="password" type="text" required autoComplete="off" state={state} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rôle *" name="roleId" state={state}><Select name="roleId" required defaultValue="" state={state}><option value="">Choisir…</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Département" name="departmentId" state={state} hint="Par défaut : celui de l'employé.">
          <Select key={empId} name="departmentId" defaultValue={emp?.departmentId ?? ""} state={state}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </Field>
        <Field label="Statut" name="status" state={state}><Select name="status" defaultValue="ACTIVE" state={state}><option value="ACTIVE">Actif</option><option value="DISABLED">Désactivé</option></Select></Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Créer le compte</SubmitButton>
    </form>
  );
}
