// Module Caisse (transfert PREMIDIS) : sessions, opérations, billetage, liens avec la facturation et la finance.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError, ValidationError } from "../../src/server/auth/actor";
import * as cash from "../../src/server/services/cash";
import * as billing from "../../src/server/services/billing";
import { actorWithRole, freshSeed } from "../helpers";

type A = Awaited<ReturnType<typeof actorWithRole>>;
let cashier: A, finance: A, nurse: A, admin: A, dg: A;
let patientId = "";
before(async () => {
  await freshSeed();
  [cashier, finance, nurse, admin, dg] = await Promise.all(["CAISSIER", "FINANCE", "INFIRMIER", "SUPER_ADMIN", "DIRECTEUR_GENERAL"].map((r) => actorWithRole(r, { superAdmin: r === "SUPER_ADMIN" })));
  patientId = (await db.patient.create({ data: { patientNumber: `PC-${Date.now()}`, lastName: "Kavira", firstName: "Esther", searchName: "kavira esther" } })).id;
});
after(() => db.$disconnect());

test("ouverture : fond de caisse, une seule session par devise, droits vérifiés", async () => {
  assert.equal(await cash.currentSession(cashier.actor, "USD"), null);
  await assert.rejects(cash.openSession(nurse.actor, { currency: "USD", openingFloat: "10" }), ForbiddenError);
  await assert.rejects(cash.openSession(cashier.actor, { currency: "EUR", openingFloat: "10" }), ValidationError);
  await assert.rejects(cash.openSession(cashier.actor, { currency: "USD", openingFloat: "-5" }), ValidationError);
  const s = await cash.openSession(cashier.actor, { currency: "USD", openingFloat: "50" });
  assert.equal(s.openingFloat.toString(), "50");
  await assert.rejects(cash.openSession(cashier.actor, { currency: "USD", openingFloat: "0" }), /déjà ouverte/);
  const cdf = await cash.openSession(cashier.actor, { currency: "CDF", openingFloat: "" });
  assert.equal(cdf.openingFloat.toString(), "0", "une session CDF peut être ouverte en parallèle");
  assert.ok(await db.auditLog.findFirst({ where: { entityId: s.id, action: "OPEN" } }));
});

test("entrées et sorties : solde théorique = fond + entrées − sorties ; journal financier", async () => {
  await assert.rejects(cash.createOperation(nurse.actor, { type: "IN", currency: "USD", amount: "5", category: "apport", method: "cash" }), ForbiddenError);
  await assert.rejects(cash.createOperation(cashier.actor, { type: "IN", currency: "USD", amount: "0", category: "apport", method: "cash" }), ValidationError);
  await assert.rejects(cash.createOperation(cashier.actor, { type: "IN", currency: "USD", amount: "5", category: "loyer", method: "cash" }), /Catégorie/);
  await assert.rejects(cash.createOperation(cashier.actor, { type: "OUT", currency: "USD", amount: "5", category: "transport", method: "cheque" }), /Méthode/);
  const inOp = await cash.createOperation(cashier.actor, { type: "IN", currency: "USD", amount: "20", category: "apport", method: "cash", description: "Apport direction" });
  const outOp = await cash.createOperation(cashier.actor, { type: "OUT", currency: "USD", amount: "7.50", category: "transport", method: "mobile" });
  assert.match(inOp.number, /^CAI-\d{4}-\d{5}$/);
  const s = await cash.currentSession(cashier.actor, "USD");
  assert.equal(s!.totalIn.toString(), "20"); assert.equal(s!.totalOut.toString(), "7.5"); assert.equal(s!.expected.toString(), "62.5");
  const l1 = await db.ledgerEntry.findFirstOrThrow({ where: { sourceType: "CASH_OPERATION", sourceId: inOp.id } });
  const l2 = await db.ledgerEntry.findFirstOrThrow({ where: { sourceType: "CASH_OPERATION", sourceId: outOp.id } });
  assert.equal(l1.type, "REVENUE"); assert.equal(l1.amount.toString(), "20");
  assert.equal(l2.type, "EXPENSE"); assert.equal(l2.amount.toString(), "-7.5");
  const ops = await cash.listOperations(cashier.actor, { sessionId: s!.id });
  assert.equal(ops.length, 2); assert.equal(ops[0].id, outOp.id, "plus récente en premier");
});

test("facturation → caisse : encaissement inscrit dans la session ouverte, extourne en sortie, sans double écriture au journal", async () => {
  await db.charge.create({ data: { patientId, source: "SERVICE", description: "Consultation", quantity: 1, unitPrice: "10", currency: "USD", total: "10", createdById: admin.user.id } });
  const inv = await billing.createPatientInvoice(cashier.actor, patientId, "USD");
  const pay = await billing.recordPayment(cashier.actor, inv.id, { amount: "10", currency: "USD" });
  const s = await cash.currentSession(cashier.actor, "USD");
  assert.equal(pay.cashSessionId, s!.id);
  const op = await db.cashOperation.findUniqueOrThrow({ where: { paymentId: pay.id } });
  assert.equal(op.type, "IN"); assert.equal(op.category, "facture"); assert.equal(op.sessionId, s!.id);
  assert.equal(s!.expected.toString(), "72.5");
  assert.equal(await db.ledgerEntry.count({ where: { sourceId: op.id } }), 0, "le journal est déjà écrit par la facturation");
  const rev = await billing.reversePayment(finance.actor, pay.id, "Erreur de saisie");
  const back = await db.cashOperation.findUniqueOrThrow({ where: { paymentId: rev.id } });
  assert.equal(back.type, "OUT"); assert.equal(back.category, "extourne"); assert.equal(back.amount.toString(), "10");
  assert.equal((await cash.currentSession(cashier.actor, "USD"))!.expected.toString(), "62.5");
});

test("crédit patient : le remboursement d'une dette est classé « dette »", async () => {
  const inv = await db.invoice.findFirstOrThrow({ where: { patientId, status: "ISSUED" } });
  const cr = await billing.requestCredit(cashier.actor, inv.id, "Patient sans ressources");
  await billing.decideCredit(dg.actor, cr.id, true);
  const pay = await billing.recordPayment(cashier.actor, inv.id, { amount: "4", currency: "USD" });
  assert.equal((await db.cashOperation.findUniqueOrThrow({ where: { paymentId: pay.id } })).category, "dette");
});

test("sans session ouverte, l'encaissement reste possible (comme PREMIDIS) et n'est rattaché à aucune session", async () => {
  await db.charge.create({ data: { patientId, source: "SERVICE", description: "Analyse", quantity: 1, unitPrice: "28000", currency: "CDF", total: "28000", createdById: admin.user.id } });
  await cash.closeSession(cashier.actor, { currency: "CDF", counts: {} });
  const inv = await billing.createPatientInvoice(cashier.actor, patientId, "CDF");
  const pay = await billing.recordPayment(cashier.actor, inv.id, { amount: "1000", currency: "CDF" });
  assert.equal(pay.cashSessionId, null);
  assert.equal((await db.cashOperation.findUniqueOrThrow({ where: { paymentId: pay.id } })).sessionId, null);
});

test("clôture : billetage, compté, écart, notification à la Finance ; historique et rapport", async () => {
  await assert.rejects(cash.closeSession(nurse.actor, { currency: "USD", counts: {} }), ForbiddenError);
  await assert.rejects(cash.closeSession(cashier.actor, { currency: "USD", counts: { "100": "-1" } }), ValidationError);
  const expected = (await cash.currentSession(cashier.actor, "USD"))!.expected; // 66.5 (62.5 + remboursement de 4)
  assert.equal(expected.toString(), "66.5");
  const closed = await cash.closeSession(cashier.actor, { currency: "USD", counts: { "50": "1", "10": "1", "5": "1", "1": "1" }, notes: "Fin de journée" });
  assert.equal(closed.countedAmount!.toString(), "66"); assert.equal(closed.difference!.toString(), "-0.5");
  assert.equal(closed.totalIn!.toString(), "34"); assert.equal(closed.totalOut!.toString(), "17.5");
  assert.deepEqual((closed.denominations as { denomination: number; count: number }[]).find((d) => d.denomination === 50), { denomination: 50, count: 1 });
  assert.ok(closed.closedAt); assert.equal(await cash.currentSession(cashier.actor, "USD"), null);
  const notif = await db.notification.findFirst({ where: { recipientUserId: finance.user.id, type: "cash_variance", entityId: closed.id } });
  assert.ok(notif, "la Finance est prévenue de l'écart");
  assert.equal(await db.notification.count({ where: { recipientUserId: nurse.user.id, type: "cash_variance" } }), 0);
  await assert.rejects(cash.closeSession(cashier.actor, { currency: "USD", counts: {} }), /Aucune session/);
  const hist = await cash.listSessions(finance.actor);
  assert.ok(hist.some((h) => h.id === closed.id && h.closedByName));
  const usd = (await cash.cashReport(finance.actor, new Date(Date.now() - 86400e3), new Date(Date.now() + 1000)))[0];
  assert.equal(usd.currency, "USD"); assert.equal(usd.totalIn.toString(), "34"); assert.equal(usd.totalOut.toString(), "17.5");
  assert.ok(usd.inByCategory.some((c) => c.category === "apport")); assert.ok(usd.outByCategory.some((c) => c.category === "extourne"));
  await assert.rejects(cash.listSessions(nurse.actor), ForbiddenError);
});

test("opérations de caisse : jamais modifiées ni supprimées", async () => {
  const op = await db.cashOperation.findFirstOrThrow();
  await assert.rejects(db.cashOperation.update({ where: { id: op.id }, data: { amount: "1" } }));
  await assert.rejects(db.cashOperation.delete({ where: { id: op.id } }));
});
