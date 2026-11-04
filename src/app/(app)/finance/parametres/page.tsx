import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { currentRate } from "@/server/services/billing";
import { listApprovalRules, listCategories } from "@/server/services/finance";
import { listRoles } from "@/server/services/roles";
import { db } from "@/server/db";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { BillingActions as A, SimpleForm } from "@/components/billing/billing-forms";
import { Field, Input, Select } from "@/components/ui/form";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Paramètres financiers" };
export default async function Page() {
  const actor = await requirePage("finance", "view");
  const [rate, rates, cats, rules, roles] = await Promise.all([currentRate(), db.exchangeRate.findMany({ orderBy: { effectiveAt: "desc" }, take: 10 }), listCategories(), listApprovalRules(), listRoles()]);
  return (<div className="max-w-4xl space-y-5">
    <PageHeader title="Paramètres financiers" />
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Taux de change</h2>
      <p className="mb-3 text-sm">{rate ? <>Taux actuel : <strong>1 USD = {rate.toString()} CDF</strong></> : <span className="text-[#ffe7b3]">Aucun taux défini : les factures mélangeant USD et CDF sont impossibles.</span>}</p>
      {can(actor, "finance", "update") && <SimpleForm action={A.rateAction} submit="Enregistrer le taux"><Field label="1 USD = … CDF *" name="rate"><Input name="rate" required inputMode="decimal" /></Field></SimpleForm>}
      {rates.length > 0 && <ul className="mt-3 text-xs text-muted">{rates.map((r) => <li key={r.id}>{fmtDateTime(r.effectiveAt)} — {r.rate.toString()}</li>)}</ul>}
    </Card>
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Catégories de dépenses</h2>
      <p className="mb-3 text-sm">{cats.length ? cats.map((c) => c.name).join(" · ") : "Aucune catégorie."}</p>
      {can(actor, "finance", "update") && <SimpleForm action={A.categoryAction} submit="Ajouter"><Field label="Nouvelle catégorie" name="name"><Input name="name" required /></Field></SimpleForm>}
    </Card>
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Plafonds de validation des dépenses</h2>
      <Alert tone="warning" title="À définir par l'hôpital">Tant qu&apos;aucun plafond n&apos;est défini, toute personne ayant « Finance — Valider » peut valider une dépense (jamais la sienne).</Alert>
      <ul className="my-3 text-sm">{rules.map((r) => <li key={r.id}>{r.role.name} : {r.maxAmount ? `jusqu'à ${r.maxAmount} ${r.currency}` : `sans plafond (${r.currency})`}</li>)}</ul>
      {(actor.isSuperAdmin || can(actor, "settings", "update")) && <SimpleForm action={A.ruleAction} submit="Enregistrer le plafond"><div className="grid gap-3 sm:grid-cols-3">
        <Field label="Rôle *" name="roleId"><Select name="roleId" required defaultValue=""><option value="">Choisir…</option>{roles.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Devise" name="currency"><Select name="currency" defaultValue="USD"><option>USD</option><option>CDF</option></Select></Field>
        <Field label="Montant maximum" name="maxAmount" hint="Vide = sans plafond"><Input name="maxAmount" inputMode="decimal" /></Field></div></SimpleForm>}
    </Card>
  </div>);
}
