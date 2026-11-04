import { Download } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { buildReport, LABELS } from "@/server/services/reports";
import { fmtMoney } from "@/server/services/billing";
import { listDoctors } from "@/server/services/reception";
import { listSpecialties } from "@/server/services/specialties";
import { listDepartments } from "@/server/services/departments";
import { Card, PageHeader, StatCard } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { parseFilter, type RawFilter } from "./filters";

export const metadata = { title: "Rapports" };
const Bars = ({ rows }: { rows: { name: string; count: number }[] }) => {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows.length === 0 ? <p className="text-sm text-muted">Aucune donnée sur la période.</p> : (
    <ul className="space-y-2">{rows.map((r) => <li key={r.name} className="text-sm"><div className="mb-1 flex justify-between gap-2"><span>{r.name}</span><strong>{r.count}</strong></div>
      <div className="h-2 rounded-full bg-white/10" aria-hidden><div className="h-2 rounded-full bg-brand-400" style={{ width: `${(r.count / max) * 100}%` }} /></div></li>)}</ul>);
};
export default async function Page({ searchParams }: { searchParams: Promise<RawFilter> }) {
  const actor = await requirePage("reports", "view");
  const sp = await searchParams;
  const f = parseFilter(sp);
  const [r, doctors, specs, deps] = await Promise.all([buildReport(actor, f), listDoctors(), listSpecialties(), listDepartments()]);
  const qs = new URLSearchParams(Object.entries({ du: f.du, au: f.au, medecin: sp.medecin ?? "", specialite: sp.specialite ?? "", service: sp.service ?? "" }).filter(([, v]) => v)).toString();
  return (<>
    <PageHeader title="Rapports et statistiques" subtitle="Calculés sur les données réelles de la période" actions={can(actor, "reports", "export") && <a href={`/rapports/export?${qs}`} className={buttonClass()}><Download className="size-4" />Exporter en PDF</a>} />
    <form className="glass mb-5 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <label className="block"><span className="mb-1 block text-sm">Du</span><input type="date" name="du" defaultValue={f.du} className="field" /></label>
      <label className="block"><span className="mb-1 block text-sm">Au</span><input type="date" name="au" defaultValue={f.au} className="field" /></label>
      <label className="block"><span className="mb-1 block text-sm">Médecin</span><select name="medecin" defaultValue={sp.medecin ?? ""} className="field"><option value="">Tous</option>{doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.lastName.toUpperCase()}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-sm">Spécialité</span><select name="specialite" defaultValue={sp.specialite ?? ""} className="field"><option value="">Toutes</option>{specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-sm">Service</span><select name="service" defaultValue={sp.service ?? ""} className="field"><option value="">Tous</option>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <button className={buttonClass("secondary")}>Afficher</button>
    </form>
    <h2 className="mb-3 text-lg font-semibold">Activités médicales</h2>
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard label="Nouveaux patients" value={r.medical.newPatients} /><StatCard label="Passages" value={r.medical.visits} /><StatCard label="Consultations" value={r.medical.consultations} tone="green" />
      <StatCard label="Hospitalisations / urgences" value={Object.values(r.medical.admissions).reduce((a, b) => a + b, 0)} tone="amber" /><StatCard label="Accouchements" value={r.medical.deliveries} />
    </div>
    <div className="mb-5 grid gap-5 lg:grid-cols-3">
      <Card><h3 className="mb-3 font-semibold">Consultations par médecin</h3><Bars rows={r.medical.byDoctor} /></Card>
      <Card><h3 className="mb-3 font-semibold">Consultations par spécialité</h3><Bars rows={r.medical.bySpecialty} /></Card>
      <Card><h3 className="mb-3 font-semibold">Rendez-vous</h3><Bars rows={Object.entries(r.medical.appointments).map(([k, v]) => ({ name: LABELS.APPT[k] ?? k, count: v }))} /></Card>
    </div>
    <div className="mb-5 grid gap-5 lg:grid-cols-2">
      {r.lab && <Card><h3 className="mb-3 font-semibold">Laboratoire ({r.lab.tests} analyses)</h3><Bars rows={Object.entries(r.lab.byStatus).map(([k, v]) => ({ name: LABELS.LAB[k] ?? k, count: v }))} /></Card>}
      <Card><h3 className="mb-3 font-semibold">Pharmacie ({r.pharmacy.lowStock} produit(s) en alerte)</h3><Bars rows={Object.entries(r.pharmacy.movements).map(([k, v]) => ({ name: LABELS.MV[k] ?? k, count: v.count }))} />
        {r.pharmacy.sales.map((s) => <p key={s.currency} className="mt-2 text-sm">Ventes {s.currency} : <strong>{fmtMoney(s.total, s.currency)}</strong> ({s.count})</p>)}</Card>
    </div>
    {r.finance && <><h2 className="mb-3 text-lg font-semibold">Finance</h2><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{r.finance.flatMap((x) => [
      <StatCard key={`r${x.currency}`} label={`Recettes ${x.currency}`} value={fmtMoney(x.revenue, x.currency)} tone="green" />, <StatCard key={`e${x.currency}`} label={`Dépenses ${x.currency}`} value={fmtMoney(x.expenses, x.currency)} tone="red" />,
      <StatCard key={`i${x.currency}`} label={`Facturé ${x.currency} (${x.invoices})`} value={fmtMoney(x.invoiced, x.currency)} />, <StatCard key={`d${x.currency}`} label={`Dettes ouvertes ${x.currency}`} value={fmtMoney(x.debts, x.currency)} tone="amber" />])}</div></>}
    {r.hr && <><h2 className="mb-3 text-lg font-semibold">Personnel</h2><Card><p className="mb-2 text-sm">Employés actifs : <strong>{r.hr.headcount.ACTIVE ?? 0}</strong></p>
      <ul className="text-sm">{r.hr.items.map((i) => <li key={`${i.type}${i.currency}`}>{LABELS.PAY[i.type]} : {fmtMoney(i.total, i.currency)}</li>)}{r.hr.items.length === 0 && <li className="text-muted">Aucune opération de paie sur la période.</li>}</ul></Card></>}
  </>);
}
