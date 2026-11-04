"use client";
import { useState } from "react";
import { useActionToast } from "@/components/ui/toast";
import * as A from "@/app/(app)/personnel/hr-actions";
import { Dialog } from "@/components/ui/dialog";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";

type Emp = { firstName: string; lastName: string; postName: string | null; phone: string | null; email: string | null; address: string | null; position: string; departmentId: string | null; status: string };
export function EmployeeEdit({ id, e, departments }: { id: string; e: Emp; departments: { id: string; name: string }[] }) {
  const [state, action] = useActionToast(A.updateEmployeeAction.bind(null, id));
  return (<form action={action} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Nom *" name="lastName" state={state}><Input name="lastName" required defaultValue={e.lastName} state={state} /></Field>
      <Field label="Post-nom" name="postName" state={state}><Input name="postName" defaultValue={e.postName ?? ""} state={state} /></Field>
      <Field label="Prénom *" name="firstName" state={state}><Input name="firstName" required defaultValue={e.firstName} state={state} /></Field>
      <Field label="Téléphone" name="phone" state={state}><Input name="phone" defaultValue={e.phone ?? ""} state={state} /></Field>
      <Field label="E-mail" name="email" state={state}><Input name="email" defaultValue={e.email ?? ""} state={state} /></Field>
      <Field label="Adresse" name="address" state={state}><Input name="address" defaultValue={e.address ?? ""} state={state} /></Field>
      <Field label="Fonction *" name="position" state={state}><Input name="position" required defaultValue={e.position} state={state} /></Field>
      <Field label="Département" name="departmentId" state={state}><Select name="departmentId" defaultValue={e.departmentId ?? ""} state={state}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      <Field label="Statut" name="status" state={state}><Select name="status" defaultValue={e.status} state={state}><option value="ACTIVE">Actif</option><option value="SUSPENDED">Suspendu</option><option value="LEFT">Parti</option></Select></Field>
    </div>
    <Field label="Nouvelle photo" name="photo" state={state}><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-ink" /></Field>
    <FormMessage state={state} /><SubmitButton variant="secondary">Enregistrer</SubmitButton>
  </form>);
}
export function ContractForm({ id }: { id: string }) {
  const [state, action] = useActionToast(A.contractAction.bind(null, id));
  return (<form action={action} key={state?.ok ? String(Math.random()) : "c"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
    <Field label="Type *" name="type" state={state}><Input name="type" required placeholder="CDI, CDD…" state={state} /></Field>
    <Field label="Début *" name="startDate" state={state}><Input name="startDate" type="date" required state={state} /></Field>
    <Field label="Fin" name="endDate" state={state}><Input name="endDate" type="date" state={state} /></Field>
    <Field label="Salaire de base *" name="baseSalary" state={state}><Input name="baseSalary" required inputMode="decimal" state={state} /></Field>
    <Field label="Devise" name="currency" state={state}><Select name="currency" defaultValue="USD" state={state}><option>USD</option><option>CDF</option></Select></Field>
    <SubmitButton variant="secondary">Enregistrer le contrat</SubmitButton>
    <div className="sm:col-span-2 lg:col-span-6"><FormMessage state={state} /></div>
  </form>);
}
const TYPES = { ADVANCE: "Avance", BONUS: "Prime", DEDUCTION: "Déduction", SALARY_PAYMENT: "Paiement de salaire", WORK_EXPENSE: "Dépense professionnelle" };
export function PayrollItemForm({ id, period, currency }: { id: string; period: string; currency: string }) {
  const [state, action] = useActionToast(A.payrollItemAction.bind(null, id));
  return (<form action={action} key={state?.ok ? String(Math.random()) : "p"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
    <Field label="Période *" name="period" state={state}><Input name="period" type="month" required defaultValue={period} state={state} /></Field>
    <Field label="Type *" name="type" state={state}><Select name="type" defaultValue="ADVANCE" state={state}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
    <Field label="Montant *" name="amount" state={state}><Input name="amount" required inputMode="decimal" state={state} /></Field>
    <Field label="Devise" name="currency" state={state}><Select name="currency" defaultValue={currency} state={state}><option>USD</option><option>CDF</option></Select></Field>
    <Field label="Description" name="description" state={state}><Input name="description" state={state} /></Field>
    <SubmitButton variant="secondary">Enregistrer</SubmitButton>
    <div className="sm:col-span-2 lg:col-span-6"><FormMessage state={state} /></div>
  </form>);
}
export function CancelItem({ id, itemId }: { id: string; itemId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionToast(async (s, fd) => { const r = await A.cancelItemAction(id, itemId, s, fd); if (r?.ok) setOpen(false); return r; });
  return (<><Button variant="ghost" className="!min-h-9 text-xs" onClick={() => setOpen(true)}>Annuler</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Annuler cette opération" size="sm"><form action={action} className="space-y-3">
      <Field label="Motif *" name="reason" state={state}><Input name="reason" required state={state} /></Field><FormMessage state={state} /><div className="flex justify-end"><SubmitButton variant="danger">Annuler l&apos;opération</SubmitButton></div></form></Dialog></>);
}
export function PayslipForm({ id, period }: { id: string; period: string }) {
  const [state, action] = useActionToast(A.payslipAction.bind(null, id));
  return (<form action={action} className="flex flex-wrap items-end gap-2">
    <Field label="Période" name="period" state={state}><Input name="period" type="month" required defaultValue={period} state={state} /></Field>
    <SubmitButton>Générer le bulletin</SubmitButton><div className="w-full"><FormMessage state={state} /></div>
  </form>);
}
export function LeaveForm({ id }: { id: string }) {
  const [state, action] = useActionToast(A.leaveAction.bind(null, id));
  return (<form action={action} key={state?.ok ? String(Math.random()) : "l"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
    <Field label="Type *" name="type" state={state}><Input name="type" required placeholder="Congé annuel…" state={state} /></Field>
    <Field label="Du *" name="startDate" state={state}><Input name="startDate" type="date" required state={state} /></Field>
    <Field label="Au *" name="endDate" state={state}><Input name="endDate" type="date" required state={state} /></Field>
    <Field label="Motif" name="reason" state={state}><Input name="reason" state={state} /></Field>
    <SubmitButton variant="secondary">Demander</SubmitButton><div className="sm:col-span-2 lg:col-span-5"><FormMessage state={state} /></div>
  </form>);
}
export function LeaveDecision({ id, leaveId }: { id: string; leaveId: string }) {
  const [s1, ok] = useActionToast(A.decideLeaveAction.bind(null, id, leaveId, true));
  const [s2, no] = useActionToast(A.decideLeaveAction.bind(null, id, leaveId, false));
  return <div className="flex gap-2"><form action={ok}><SubmitButton pendingLabel="…" className="!min-h-9">Accorder</SubmitButton></form><form action={no}><SubmitButton variant="ghost" pendingLabel="…" className="!min-h-9">Refuser</SubmitButton></form>{(s1?.error || s2?.error) && <span className="text-sm text-danger">{s1?.error ?? s2?.error}</span>}</div>;
}
