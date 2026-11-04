import { Prisma } from "@prisma/client";
import { db } from "../db";
import { assertCan, can, type Actor } from "../auth/actor";
import { createPdf, section, table, paragraph } from "../pdf";
import { audit } from "./audit";
import { documentNumber, storeDocument } from "./documents";
import { fmtMoney } from "./billing";

export type ReportFilter = { from: Date; to: Date; doctorId?: string; specialtyId?: string; departmentId?: string };
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** Statistiques calculées sur les données réelles ; chaque section dépend des permissions de l'utilisateur. */
export async function buildReport(actor: Actor, f: ReportFilter) {
  assertCan(actor, "reports", "view");
  const range = { gte: f.from, lt: f.to };
  const cWhere: Prisma.ConsultationWhereInput = { startedAt: range, status: { not: "CANCELLED" }, doctorId: f.doctorId, specialtyId: f.specialtyId };
  const [newPatients, visits, consultations, byDoctor, bySpecialty, appts, admissions, deliveries] = await Promise.all([
    db.patient.count({ where: { createdAt: range } }),
    db.visit.count({ where: { arrivedAt: range, status: { not: "CANCELLED" }, orientedToDepartmentId: f.departmentId } }),
    db.consultation.count({ where: cWhere }),
    db.consultation.groupBy({ by: ["doctorId"], where: cWhere, _count: { _all: true } }),
    db.consultation.groupBy({ by: ["specialtyId"], where: cWhere, _count: { _all: true } }),
    db.appointment.groupBy({ by: ["status"], where: { scheduledAt: range, doctorId: f.doctorId, specialtyId: f.specialtyId }, _count: { _all: true } }),
    db.admission.groupBy({ by: ["type"], where: { admittedAt: range }, _count: { _all: true } }),
    db.maternityRecord.count({ where: { context: "MATERNITY_DELIVERY", recordedAt: range } }),
  ]);
  const [doctors, specs] = await Promise.all([
    db.employee.findMany({ where: { id: { in: byDoctor.map((x) => x.doctorId) } }, select: { id: true, firstName: true, lastName: true } }),
    db.specialty.findMany({ where: { id: { in: bySpecialty.map((x) => x.specialtyId) } }, select: { id: true, name: true } }),
  ]);
  const medical = {
    newPatients, visits, consultations, deliveries,
    byDoctor: byDoctor.map((x) => { const d = doctors.find((e) => e.id === x.doctorId); return { name: d ? `Dr ${d.lastName.toUpperCase()} ${d.firstName}` : "—", count: x._count._all }; }).sort((a, b) => b.count - a.count),
    bySpecialty: bySpecialty.map((x) => ({ name: specs.find((s) => s.id === x.specialtyId)?.name ?? "—", count: x._count._all })).sort((a, b) => b.count - a.count),
    appointments: Object.fromEntries(appts.map((a) => [a.status, a._count._all])) as Record<string, number>,
    admissions: Object.fromEntries(admissions.map((a) => [a.type, a._count._all])) as Record<string, number>,
  };
  const lab = can(actor, "laboratory", "view") || can(actor, "reports", "view") ? {
    byStatus: Object.fromEntries((await db.labRequest.groupBy({ by: ["status"], where: { requestedAt: range }, _count: { _all: true } })).map((x) => [x.status, x._count._all])) as Record<string, number>,
    tests: await db.labRequestItem.count({ where: { labRequest: { requestedAt: range, status: { not: "CANCELLED" } } } }),
  } : null;
  const mv = await db.stockMovement.groupBy({ by: ["type"], where: { at: range }, _count: { _all: true }, _sum: { quantity: true } });
  const sales = await db.sale.groupBy({ by: ["currency"], where: { createdAt: range }, _sum: { total: true }, _count: { _all: true } });
  const pharmacy = {
    movements: Object.fromEntries(mv.map((m) => [m.type, { count: m._count._all, quantity: Math.abs(m._sum.quantity ?? 0) }])) as Record<string, { count: number; quantity: number }>,
    sales: sales.map((s) => ({ currency: s.currency, total: s._sum.total ?? D(0), count: s._count._all })),
    lowStock: (await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "Product" WHERE active AND "quantityOnHand" <= "minStockLevel"`)[0].n.toString(),
  };
  let finance = null;
  if (can(actor, "finance", "view")) {
    const [ledger, inv, debts] = await Promise.all([
      db.ledgerEntry.groupBy({ by: ["type", "currency"], where: { at: range }, _sum: { amount: true } }),
      db.invoice.groupBy({ by: ["currency"], where: { issuedAt: range, status: { not: "CANCELLED" } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
      db.debt.findMany({ where: { status: { not: "SETTLED" } }, include: { invoice: true } }),
    ]);
    finance = (["USD", "CDF"] as const).map((c) => {
      const g = (t: string) => ledger.find((l) => l.type === t && l.currency === c)?._sum.amount ?? D(0);
      const i = inv.find((x) => x.currency === c);
      return { currency: c, revenue: g("REVENUE").add(g("REVERSAL")), expenses: g("EXPENSE").neg(), invoices: i?._count._all ?? 0, invoiced: i?._sum.total ?? D(0),
        debts: debts.filter((d) => d.currency === c).reduce((s, d) => s.add(d.invoice.total.sub(d.invoice.amountPaid)), D(0)) };
    });
  }
  let hr = null;
  if (can(actor, "hr", "view")) {
    const [headcount, items] = await Promise.all([
      db.employee.groupBy({ by: ["status"], _count: { _all: true } }),
      db.payrollItem.groupBy({ by: ["type", "currency"], where: { createdAt: range, cancelledAt: null }, _sum: { amount: true } }),
    ]);
    hr = { headcount: Object.fromEntries(headcount.map((h) => [h.status, h._count._all])) as Record<string, number>, items: items.map((i) => ({ type: i.type, currency: i.currency, total: i._sum.amount ?? D(0) })) };
  }
  return { filter: f, medical, lab, pharmacy, finance, hr };
}

const APPT: Record<string, string> = { SCHEDULED: "Prévus", HONORED: "Honorés", MISSED: "Manqués", CANCELLED: "Annulés", RESCHEDULED: "Reportés" };
const ADM: Record<string, string> = { EMERGENCY: "Urgences", HOSPITALIZATION: "Hospitalisations", MATERNITY: "Maternité" };
const LAB: Record<string, string> = { REQUESTED: "Nouvelles", SAMPLED: "Prélevées", IN_PROGRESS: "En cours", AWAITING_VALIDATION: "À valider", VALIDATED: "Validées", CANCELLED: "Annulées" };
const MV: Record<string, string> = { ENTRY: "Entrées", SALE: "Ventes", PATIENT_CONSUMPTION: "Consommations patients", ADJUSTMENT: "Corrections", REVERSAL: "Annulations" };
const PAY: Record<string, string> = { ADVANCE: "Avances", BONUS: "Primes", DEDUCTION: "Déductions", SALARY_PAYMENT: "Salaires payés", WORK_EXPENSE: "Dépenses professionnelles" };
export const LABELS = { APPT, ADM, LAB, MV, PAY };

export async function exportReportPdf(actor: Actor, f: ReportFilter) {
  assertCan(actor, "reports", "export");
  const r = await buildReport(actor, f);
  const number = await documentNumber("REPORT");
  const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Africa/Lubumbashi" });
  const pdf = await createPdf({ title: "Rapport d'activité", reference: number, date: new Date(), subtitle: `Du ${day(f.from)} au ${day(new Date(f.to.getTime() - 1))}` }, (doc) => {
    section(doc, "Activités médicales");
    table(doc, ["Indicateur", "Valeur"], [345, 150], [["Nouveaux dossiers patients", String(r.medical.newPatients)], ["Passages", String(r.medical.visits)], ["Consultations", String(r.medical.consultations)], ["Accouchements enregistrés", String(r.medical.deliveries)],
      ...Object.entries(r.medical.admissions).map(([k, v]) => [ADM[k] ?? k, String(v)]), ...Object.entries(r.medical.appointments).map(([k, v]) => [`Rendez-vous ${APPT[k]?.toLowerCase() ?? k}`, String(v)])], ["left", "right"]);
    if (r.medical.byDoctor.length) table(doc, ["Médecin", "Consultations"], [345, 150], r.medical.byDoctor.map((x) => [x.name, String(x.count)]), ["left", "right"]);
    if (r.medical.bySpecialty.length) table(doc, ["Spécialité", "Consultations"], [345, 150], r.medical.bySpecialty.map((x) => [x.name, String(x.count)]), ["left", "right"]);
    if (r.lab) { section(doc, "Laboratoire"); table(doc, ["Demandes", "Nombre"], [345, 150], [...Object.entries(r.lab.byStatus).map(([k, v]) => [LAB[k] ?? k, String(v)]), ["Analyses demandées", String(r.lab.tests)]], ["left", "right"]); }
    section(doc, "Pharmacie");
    table(doc, ["Indicateur", "Valeur"], [345, 150], [...Object.entries(r.pharmacy.movements).map(([k, v]) => [MV[k] ?? k, `${v.count} (${v.quantity} unités)`]), ...r.pharmacy.sales.map((s) => [`Ventes (${s.currency})`, fmtMoney(s.total, s.currency)]), ["Produits en alerte de stock", r.pharmacy.lowStock]], ["left", "right"]);
    if (r.finance) { section(doc, "Finance"); table(doc, ["Devise", "Recettes", "Dépenses", "Facturé", "Dettes ouvertes"], [55, 110, 110, 110, 110], r.finance.map((x) => [x.currency, fmtMoney(x.revenue, x.currency), fmtMoney(x.expenses, x.currency), fmtMoney(x.invoiced, x.currency), fmtMoney(x.debts, x.currency)]), ["left", "right", "right", "right", "right"]); }
    if (r.hr) { section(doc, "Personnel"); table(doc, ["Indicateur", "Valeur"], [345, 150], [["Employés actifs", String(r.hr.headcount.ACTIVE ?? 0)], ...r.hr.items.map((i) => [`${PAY[i.type]} (${i.currency})`, fmtMoney(i.total, i.currency)])], ["left", "right"]); }
    paragraph(doc, "Statistiques calculées à partir des données enregistrées dans CMD Pro sur la période.");
  });
  const d = await storeDocument({ type: "REPORT", title: `Rapport d'activité ${day(f.from)} – ${day(new Date(f.to.getTime() - 1))}`, pdf, number, createdById: actor.userId });
  await audit(actor, { action: "EXPORT", module: "reports", entityType: "Document", entityId: d.id });
  return { doc: d, pdf };
}
