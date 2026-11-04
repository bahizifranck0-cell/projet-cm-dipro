import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { computePayroll, getEmployee, PAYROLL_TYPE } from "@/server/services/hr";
import { fmtMoney } from "@/server/services/billing";
import { listDepartments } from "@/server/services/departments";
import { Avatar } from "@/components/avatar";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { CancelItem, ContractForm, EmployeeEdit, LeaveDecision, LeaveForm, PayrollItemForm, PayslipForm } from "@/components/hr/hr-forms";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Dossier du personnel" };
const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  if (!can(actor, "hr", "view") && actor.employeeId !== id) redirect("/acces-refuse");
  const e = await getEmployee(actor, id);
  if (!e) notFound();
  const own = actor.employeeId === id && !can(actor, "hr", "view");
  const period = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 7);
  const calc = await computePayroll(id, period).catch(() => null);
  const contract = e.contracts.find((c) => c.active);
  const deps = can(actor, "hr", "update") ? (await listDepartments(true)).map((d) => ({ id: d.id, name: d.name })) : [];
  const name = `${e.firstName} ${e.lastName}`;

  const pay = (<div className="space-y-5">
    {calc ? <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["Salaire de base", calc.baseSalary], ["Primes", calc.bonuses], ["Déductions", calc.deductions], ["Avances", calc.advances], ["Net à payer", calc.netPayable], ["Déjà payé", calc.alreadyPaid], ["Solde restant", calc.balance]].map(([k, v]) => (
      <div key={String(k)} className="rounded-xl border border-white/15 p-3"><p className="text-muted">{String(k)}</p><p className="font-semibold">{fmtMoney(v as never, calc.currency)}</p></div>))}<p className="col-span-full text-xs text-muted">Calcul de la période {period}.</p></div>
      : <Alert tone="warning">Aucun contrat : le salaire de base n&apos;est pas défini.</Alert>}
    {can(actor, "hr", "create") && <PayrollItemForm id={id} period={period} currency={contract?.currency ?? "USD"} />}
    {e.payrollItems.length === 0 ? <EmptyState title="Aucune opération." /> : (
      <ul className="divide-y divide-white/10 text-sm">{e.payrollItems.map((i) => <li key={i.id} className={`flex flex-wrap items-center gap-3 py-2 ${i.cancelledAt ? "opacity-60" : ""}`}>
        <span className="w-20 text-muted">{i.period}</span><span className="min-w-0 flex-1">{PAYROLL_TYPE[i.type]}{i.description && ` — ${i.description}`}{i.cancelledAt && <span className="text-[#ffd0d5]"> · annulé : {i.cancelReason}</span>}</span>
        <span className="font-semibold">{fmtMoney(i.amount, i.currency)}</span>{!i.cancelledAt && can(actor, "hr", "update") && <CancelItem id={id} itemId={i.id} />}</li>)}</ul>
    )}
    <div className="border-t border-white/10 pt-4">
      <h3 className="mb-2 font-semibold">Bulletins de paie</h3>
      {can(actor, "hr", "create") && contract && <PayslipForm id={id} period={period} />}
      <ul className="mt-3 space-y-1 text-sm">{e.payslips.map((s) => <li key={s.id} className="flex flex-wrap justify-between gap-2"><span>{s.period} — version {s.version} · net {fmtMoney(s.netPayable, s.currency)} · {fmtDateTime(s.generatedAt)}</span>{s.documentId && <a href={`/fichiers/documents/${s.documentId}`} target="_blank" className="font-semibold text-brand-300 hover:underline">PDF</a>}</li>)}
        {e.payslips.length === 0 && <li className="text-muted">Aucun bulletin.</li>}</ul>
    </div>
  </div>);

  return (<div className="space-y-5">
    {!own && <Link href="/personnel" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Personnel</Link>}
    <Card className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
      <Avatar employeeId={e.id} hasPhoto={!!e.photoPath} name={name} size={88} />
      <div className="min-w-0 flex-1"><PageHeader title={`${e.lastName.toUpperCase()} ${e.postName ?? ""} ${e.firstName}`} subtitle={`${e.matricule} · ${e.position}${e.department ? ` · ${e.department.name}` : ""}`} />
        <div className="-mt-3 flex flex-wrap justify-center gap-2 sm:justify-start"><Badge tone={e.status === "ACTIVE" ? "green" : "amber"}>{e.status === "ACTIVE" ? "Actif" : e.status === "SUSPENDED" ? "Suspendu" : "Parti"}</Badge>
          {e.user && <Badge tone="blue">Compte : {e.user.username} ({e.user.role.name})</Badge>}{contract && <Badge>{contract.type} · {fmtMoney(contract.baseSalary, contract.currency)}</Badge>}</div></div>
    </Card>
    <Card><Tabs tabs={[
      { label: "Paie", content: pay },
      { label: "Contrats", count: e.contracts.length, content: <div className="space-y-4">
        {can(actor, "hr", "create") && <ContractForm id={id} />}
        <ul className="space-y-2 text-sm">{e.contracts.map((c) => <li key={c.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/15 p-3"><span>{c.type} · du {day.format(c.startDate)}{c.endDate ? ` au ${day.format(c.endDate)}` : ""} · {fmtMoney(c.baseSalary, c.currency)}</span>{c.active ? <Badge tone="green">En cours</Badge> : <Badge>Ancien</Badge>}</li>)}</ul></div> },
      { label: "Congés", count: e.leaves.length, content: <div className="space-y-4">
        <Alert tone="info">Les règles détaillées des congés, présences et gardes restent à confirmer par l&apos;administration.</Alert>
        {(can(actor, "hr", "create") || actor.employeeId === id) && <LeaveForm id={id} />}
        <ul className="space-y-2 text-sm">{e.leaves.map((l) => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-3"><span>{l.type} · {day.format(l.startDate)} → {day.format(l.endDate)}{l.reason && ` · ${l.reason}`}</span>
          {l.status === "PENDING" ? (can(actor, "hr", "validate") ? <LeaveDecision id={id} leaveId={l.id} /> : <Badge tone="amber">En attente</Badge>) : <Badge tone={l.status === "APPROVED" ? "green" : "red"}>{l.status === "APPROVED" ? "Accordé" : "Refusé"}</Badge>}</li>)}</ul></div> },
      ...(can(actor, "hr", "update") ? [{ label: "Informations", content: <EmployeeEdit id={id} departments={deps} e={e} /> }] : []),
    ]} /></Card>
  </div>);
}
