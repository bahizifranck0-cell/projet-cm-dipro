import { requirePage } from "@/server/auth/current";
import { markRead } from "@/server/services/notifications";
import { can } from "@/server/auth/actor";
import { listCategories, listExpenses } from "@/server/services/finance";
import { listDepartments } from "@/server/services/departments";
import { fmtMoney } from "@/server/services/billing";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ActionButton, BillingActions as A, SimpleForm } from "@/components/billing/billing-forms";
import { Field, Input, Select } from "@/components/ui/form";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Dépenses" };
const ST = { DRAFT: "Brouillon", SUBMITTED: "À examiner", APPROVED: "Validée", REJECTED: "Refusée", PAID: "Payée", CANCELLED: "Annulée" } as const;
export default async function Page() {
  const actor = await requirePage("finance", "view");
  await markRead(actor, "all", "finance"); // module sans page de détail : consulter la liste vaut lecture
  const [list, cats, deps] = await Promise.all([listExpenses(actor), listCategories(), listDepartments(true)]);
  return (<div className="space-y-5">
    <PageHeader title="Dépenses de fonctionnement" subtitle="Achats et besoins des services (les consommations des patients passent par la pharmacie)" />
    {can(actor, "finance", "create") && (cats.length && deps.length ? <Card><h2 className="mb-3 text-lg font-semibold">Nouvelle dépense</h2>
      <SimpleForm action={A.expenseAction} submit="Soumettre la dépense"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Service *" name="departmentId"><Select name="departmentId" required defaultValue=""><option value="">Choisir…</option>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Catégorie *" name="categoryId"><Select name="categoryId" required defaultValue=""><option value="">Choisir…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="lg:col-span-2"><Field label="Description *" name="description"><Input name="description" required /></Field></div>
        <div className="grid grid-cols-[1fr_90px] gap-2"><Field label="Montant *" name="amount"><Input name="amount" required inputMode="decimal" /></Field><Field label="Devise" name="currency"><Select name="currency" defaultValue="USD"><option>USD</option><option>CDF</option></Select></Field></div>
      </div></SimpleForm></Card>
      : <Alert tone="warning">Créez d&apos;abord des départements et des catégories de dépenses (Finance → Paramètres).</Alert>)}
    {list.length === 0 ? <EmptyState title="Aucune dépense." /> : (
      <ul className="space-y-3">{list.map((e) => (
        <li key={e.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4 text-sm">
          <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 font-semibold">{e.number} — {e.description}<Badge tone={e.status === "PAID" ? "green" : e.status === "REJECTED" ? "red" : e.status === "APPROVED" ? "blue" : "amber"}>{ST[e.status]}</Badge></p>
            <p className="text-muted">{e.department.name} · {e.category.name} · {fmtMoney(e.amount, e.currency)} · {fmtDateTime(e.requestedAt)}</p></div>
          {e.status === "SUBMITTED" && can(actor, "finance", "validate") && <div className="flex gap-2"><ActionButton action={A.decideExpenseAction.bind(null, e.id, true)} label="Valider" variant="primary" /><ActionButton action={A.decideExpenseAction.bind(null, e.id, false)} label="Refuser" variant="ghost" /></div>}
          {e.status === "APPROVED" && can(actor, "finance", "update") && <ActionButton action={A.payExpenseAction.bind(null, e.id)} label="Marquer payée" />}
        </li>))}</ul>
    )}
  </div>);
}
