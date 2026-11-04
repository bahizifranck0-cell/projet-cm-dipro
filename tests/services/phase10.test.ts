import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError } from "../../src/server/auth/actor";
import * as billing from "../../src/server/services/billing";
import * as fin from "../../src/server/services/finance";
import * as hosp from "../../src/server/services/hospitalization";
import { financialClearance } from "../../src/server/services/clearance";
import { listNotifications } from "../../src/server/services/notifications";
import { actorWithRole, freshSeed } from "../helpers";

type A = Awaited<ReturnType<typeof actorWithRole>>;
let cashier: A, cashier2: A, dg: A, finance: A, finance2: A, nurse: A, resp: A, admin: A;
let patientId = "";
before(async () => {
  await freshSeed();
  [cashier, cashier2, dg, finance, finance2, nurse, resp, admin] = await Promise.all(["CAISSIER", "CAISSIER", "DIRECTEUR_GENERAL", "FINANCE", "FINANCE", "INFIRMIER", "RESP_URGENCES_HOSPITALISATION", "SUPER_ADMIN"].map((r) => actorWithRole(r, { superAdmin: r === "SUPER_ADMIN" })));
  patientId = (await db.patient.create({ data: { patientNumber: `P10-${Date.now()}`, lastName: "Bahati", firstName: "Grace", searchName: "bahati grace" } })).id;
});
after(() => db.$disconnect());
const charge = (total: string, currency: "USD" | "CDF", description: string) =>
  db.charge.create({ data: { patientId, source: "SERVICE", description, quantity: 1, unitPrice: total, currency, total, createdById: admin.user.id } });

test("tarifs : catalogue géré par les personnes autorisées", async () => {
  await assert.rejects(billing.saveTariff(cashier.actor, { code: "C1", name: "Consultation", category: "CONSULTATION", price: "5", currency: "USD" }), ForbiddenError);
  const t = await billing.saveTariff(admin.actor, { code: "c1", name: "Consultation", category: "CONSULTATION", price: "5", currency: "USD" });
  await billing.saveTariff(admin.actor, { code: "C1", name: "Consultation générale", category: "CONSULTATION", price: "6", currency: "USD" }, t.id);
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: t.id, action: "UPDATE" } });
  assert.equal((log.details as { previous: string }).previous, "5 USD");
});

test("facture globale : USD + CDF convertis au taux du jour ; facture ≠ paiement", async () => {
  await charge("10.00", "USD", "Consultation");
  await charge("28000.00", "CDF", "Analyse");
  await assert.rejects(billing.createPatientInvoice(cashier.actor, patientId, "USD"), /taux de change/);
  await assert.rejects(billing.setRate(cashier.actor, "2800"), ForbiddenError);
  await billing.setRate(finance.actor, "2800");
  const inv = await billing.createPatientInvoice(cashier.actor, patientId, "USD");
  assert.equal(inv.total.toString(), "20"); assert.equal(inv.status, "ISSUED"); assert.equal(inv.amountPaid.toString(), "0");
  assert.equal(inv.exchangeRate!.toString(), "2800");
  assert.equal(await db.payment.count({ where: { invoiceId: inv.id } }), 0);
  await assert.rejects(billing.createPatientInvoice(cashier.actor, patientId, "USD"), /Aucune prestation/);
  assert.equal((await financialClearance(patientId)).ok, false);
});

test("deux caisses en même temps ne facturent pas deux fois les mêmes prestations", async () => {
  await charge("1.00", "USD", "Pansement");
  const r = await Promise.allSettled([billing.createPatientInvoice(cashier.actor, patientId, "USD"), billing.createPatientInvoice(cashier2.actor, patientId, "USD")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  const inv = (r.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>).value;
  await billing.cancelInvoice(admin.actor, inv.id, "Test");
  assert.equal(await db.charge.count({ where: { patientId, invoiceId: null, status: "ACTIVE" } }), 1, "prestation redevenue facturable");
  await db.charge.updateMany({ where: { patientId, invoiceId: null }, data: { status: "CANCELLED" } });
});

test("paiements partiels, reçus, dépassement refusé, devise différente", async () => {
  const inv = await db.invoice.findFirstOrThrow({ where: { patientId, status: "ISSUED", total: 20 } });
  await assert.rejects(billing.recordPayment(nurse.actor, inv.id, { amount: "5", currency: "USD" }), ForbiddenError);
  const p1 = await billing.recordPayment(cashier.actor, inv.id, { amount: "5", currency: "USD" });
  assert.match(p1.number, /^REC-\d{4}-\d{5}$/);
  let x = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
  assert.equal(x.status, "PARTIALLY_PAID"); assert.equal(x.amountPaid.toString(), "5");
  await billing.recordPayment(cashier.actor, inv.id, { amount: "14000", currency: "CDF" }); // = 5 USD
  x = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
  assert.equal(x.amountPaid.toString(), "10");
  await assert.rejects(billing.recordPayment(cashier.actor, inv.id, { amount: "50", currency: "USD" }), /dépasse le reste à payer \(10,00 USD\)/);
  const receipt = await db.document.findFirstOrThrow({ where: { type: "RECEIPT", entityId: p1.id } });
  assert.ok(receipt.visibleToPatient);
  assert.equal(await db.ledgerEntry.count({ where: { sourceType: "PAYMENT" } }), 2);
});

test("remise : demandée puis validée par une autre personne autorisée", async () => {
  const inv = await db.invoice.findFirstOrThrow({ where: { patientId, status: "PARTIALLY_PAID" } });
  const d = await billing.requestDiscount(admin.actor, inv.id, { amount: "2", reason: "Geste social" });
  await assert.rejects(billing.decideDiscount(cashier.actor, d.id, true), ForbiddenError);
  await billing.decideDiscount(finance.actor, d.id, true).catch(() => {}); // la Finance n'a pas « Facturation — Valider » par défaut
  assert.equal((await db.discount.findUniqueOrThrow({ where: { id: d.id } })).status, "PENDING");
  await billing.decideDiscount(admin.actor, d.id, true);
  const x = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
  assert.equal(x.total.toString(), "18"); assert.equal(x.discountTotal.toString(), "2");
});

test("crédit : la caisse demande, seul le DG décide ; dette créée et sortie autorisée", async () => {
  const room = await db.room.create({ data: { code: `R10-${Date.now()}`, name: "S", category: "C" } });
  await db.bed.create({ data: { roomId: room.id, code: "1" } });
  const adm = await hosp.admit(resp.actor, { patientId, type: "HOSPITALIZATION" });
  const inv = await db.invoice.findFirstOrThrow({ where: { patientId, status: "PARTIALLY_PAID" } });
  await assert.rejects(hosp.discharge(resp.actor, adm.id), /il reste 8 à régler/);
  await assert.rejects(billing.requestCredit(nurse.actor, inv.id, "x"), ForbiddenError);
  const c = await billing.requestCredit(cashier.actor, inv.id, "Famille sans ressources");
  assert.equal(c.amount.toString(), "8");
  await assert.rejects(billing.requestCredit(cashier.actor, inv.id, "encore"), /existe déjà/);
  assert.ok((await listNotifications(dg.actor)).some((n) => n.entityId === c.id), "DG notifié");
  assert.ok(!(await listNotifications(cashier2.actor)).some((n) => n.entityId === c.id));
  await assert.rejects(billing.decideCredit(cashier.actor, c.id, true), ForbiddenError, "le caissier ne peut pas approuver");
  await assert.rejects(billing.decideCredit(finance.actor, c.id, true), ForbiddenError);
  await billing.decideCredit(dg.actor, c.id, true, "Accord exceptionnel");
  const debt = await db.debt.findUniqueOrThrow({ where: { invoiceId: inv.id } });
  assert.equal(debt.originalAmount.toString(), "8"); assert.equal(debt.approvedById, dg.user.id);
  assert.ok((await listNotifications(cashier.actor)).some((n) => n.type === "CREDIT_DECISION"));
  await hosp.discharge(resp.actor, adm.id);
  assert.equal((await db.admission.findUniqueOrThrow({ where: { id: adm.id } })).dischargeCreditRequestId, c.id);
});

test("dette visible au retour, puis soldée par des paiements ultérieurs", async () => {
  const open = await billing.openDebtsOf(patientId);
  assert.equal(open.length, 1); assert.equal(open[0].remaining.toString(), "8");
  const inv = await db.invoice.findFirstOrThrow({ where: { patientId, debt: { isNot: null } } });
  await billing.recordPayment(cashier.actor, inv.id, { amount: "3", currency: "USD" });
  assert.equal((await db.debt.findUniqueOrThrow({ where: { invoiceId: inv.id } })).status, "PARTIALLY_PAID");
  await billing.recordPayment(cashier.actor, inv.id, { amount: "5", currency: "USD" });
  assert.equal((await db.debt.findUniqueOrThrow({ where: { invoiceId: inv.id } })).status, "SETTLED");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "PAID");
  assert.equal((await billing.openDebtsOf(patientId)).length, 0);
});

test("extourne : réservée à la Finance, ligne négative liée, jamais deux fois, journal équilibré", async () => {
  const inv = await db.invoice.findFirstOrThrow({ where: { patientId, status: "PAID" } });
  const p = await db.payment.findFirstOrThrow({ where: { invoiceId: inv.id, amount: { gt: 0 } }, orderBy: { receivedAt: "desc" } });
  await assert.rejects(billing.reversePayment(cashier.actor, p.id, "x"), ForbiddenError);
  await assert.rejects(billing.reversePayment(finance.actor, p.id, ""), /motif/);
  const rev = await billing.reversePayment(finance.actor, p.id, "Erreur de saisie");
  assert.equal(rev.amount.toString(), "-5");
  await assert.rejects(billing.reversePayment(finance.actor, p.id, "encore"), /déjà été extourné/);
  const x = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
  assert.equal(x.status, "PARTIALLY_PAID");
  assert.equal((await db.debt.findUniqueOrThrow({ where: { invoiceId: inv.id } })).status, "PARTIALLY_PAID", "la dette se rouvre");
  await assert.rejects(db.payment.delete({ where: { id: p.id } }), /CMDPRO_IMMUTABLE/);
});

test("dépenses : saisie, plafond configurable, validation par un tiers, paiement au journal", async () => {
  const dep = await db.department.create({ data: { code: `LAB-${Date.now()}`, name: `Laboratoire ${Date.now()}` } });
  const cat = await fin.createCategory(finance.actor, "Réactifs");
  const e = await fin.createExpense(finance.actor, { departmentId: dep.id, categoryId: cat.id, description: "Réactifs paludisme", amount: "150", currency: "USD" });
  await assert.rejects(fin.decideExpense(finance.actor, e.id, true), /personne qui l'a saisie/);
  const role = await db.role.findUniqueOrThrow({ where: { code: "FINANCE" } });
  await fin.setApprovalRule(admin.actor, role.id, "USD", "100");
  await assert.rejects(fin.decideExpense(finance2.actor, e.id, true), /plafond/);
  await fin.setApprovalRule(admin.actor, role.id, "USD", "500");
  await assert.rejects(fin.payExpense(finance2.actor, e.id), /validée/);
  await fin.decideExpense(finance2.actor, e.id, true);
  await fin.payExpense(finance2.actor, e.id);
  const l = await db.ledgerEntry.findFirstOrThrow({ where: { sourceType: "EXPENSE", sourceId: e.id } });
  assert.equal(l.amount.toString(), "-150"); assert.equal(l.departmentId, dep.id);
  assert.equal(await db.charge.count({ where: { description: "Réactifs paludisme" } }), 0, "jamais confondue avec une prestation patient");
});

test("réconciliation mensuelle et situation financière", async () => {
  const period = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 7);
  const expected = await fin.expectedCash(period, "USD");
  assert.equal(expected.toString(), "-142", "5+3+5−5 = 8 USD encaissés en espèces (le paiement en CDF compte à part) − 150 de dépenses");
  const r = await fin.createReconciliation(finance.actor, { period, currency: "USD", counted: "0", notes: "Test" });
  assert.equal(r.difference.toString(), "142");
  await assert.rejects(fin.approveReconciliation(finance.actor, r.id), /autre personne/);
  await fin.approveReconciliation(finance2.actor, r.id);
  const s = await fin.financialSummary(finance.actor, new Date(Date.now() - 86400e3), new Date(Date.now() + 86400e3));
  const usd = s.find((x) => x.currency === "USD")!;
  assert.equal(usd.revenue.toString(), "8"); assert.equal(usd.expenses.toString(), "150");
});
