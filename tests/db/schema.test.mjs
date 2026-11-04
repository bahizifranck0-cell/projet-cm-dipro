// Phase 2 — tests du modèle de données sur une vraie base PostgreSQL.
// Lancer : DATABASE_URL=... npm run test:db  (base de TEST uniquement)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const run = Date.now().toString(36); // suffixe unique : les tables en ajout seul ne se vident pas
const ctx = {};

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    assert.match(String(err.message), pattern);
    return true;
  });
}

before(async () => {
  if (!/_test\b|_test$/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Refus : ces tests ne tournent que sur une base dont le nom finit par _test");
  }
  const dep = await db.department.create({ data: { code: `MED-${run}`, name: "Médecine (TEST)" } });
  const role = await db.role.create({ data: { code: `DOC-${run}`, name: "Médecin (TEST)" } });
  const emp = await db.employee.create({
    data: { matricule: `E-${run}`, firstName: "Test", lastName: "Médecin", position: "Médecin", departmentId: dep.id },
  });
  const user = await db.user.create({
    data: { username: `doc-${run}`, passwordHash: "x", roleId: role.id, employeeId: emp.id, departmentId: dep.id },
  });
  const spec = await db.specialty.create({ data: { code: `GEN-${run}`, name: "Spécialité TEST" } });
  const patient = await db.patient.create({
    data: { patientNumber: `P-${run}`, firstName: "Fictif", lastName: "PATIENT-TEST", phone: "000" },
  });
  Object.assign(ctx, { dep, role, emp, user, spec, patient });
});

after(() => db.$disconnect());

test("le dossier patient central regroupe les activités de tous les services", async () => {
  const { patient, emp, spec, dep, user } = ctx;
  const visit = await db.visit.create({ data: { patientId: patient.id, orientedToDoctorId: emp.id } });
  const consult = await db.consultation.create({
    data: { visitId: visit.id, patientId: patient.id, doctorId: emp.id, specialtyId: spec.id, diagnosis: "TEST" },
  });
  const labTest = await db.labTest.create({ data: { code: `LT-${run}`, name: "Analyse TEST" } });
  await db.labRequest.create({
    data: {
      number: `LAB-${run}`, patientId: patient.id, visitId: visit.id, consultationId: consult.id,
      requestedById: user.id, items: { create: [{ labTestId: labTest.id }] },
    },
  });
  const product = await db.product.create({
    data: { sku: `SKU-${run}`, name: "Seringue TEST", price: "0.50", currency: "USD", quantityOnHand: 10, minStockLevel: 2 },
  });
  const charge = await db.charge.create({
    data: {
      patientId: patient.id, visitId: visit.id, source: "PRODUCT", productId: product.id, departmentId: dep.id,
      description: "Seringue TEST", quantity: 1, unitPrice: "0.50", currency: "USD", total: "0.50", createdById: user.id,
    },
  });
  await db.$transaction([
    db.product.update({ where: { id: product.id }, data: { quantityOnHand: { decrement: 1 } } }),
    db.stockMovement.create({
      data: { productId: product.id, type: "PATIENT_CONSUMPTION", quantity: -1, balanceAfter: 9,
              userId: user.id, patientId: patient.id, departmentId: dep.id, chargeId: charge.id },
    }),
  ]);
  const invoice = await db.invoice.create({
    data: { number: `INV-${run}`, type: "PATIENT", patientId: patient.id, visitId: visit.id, currency: "USD",
            subtotal: "0.50", total: "0.50", status: "ISSUED", charges: { connect: [{ id: charge.id }] } },
  });
  await db.paymentMethod.upsert({ where: { code: "CASH" }, create: { code: "CASH", name: "Espèces" }, update: {} });
  await db.payment.create({
    data: { number: `REC-${run}`, invoiceId: invoice.id, amount: "0.20", currency: "USD", amountInInvoiceCcy: "0.20", cashierId: user.id },
  });
  ctx.invoice = invoice; ctx.product = product; ctx.visit = visit;

  const dossier = await db.patient.findUnique({
    where: { id: patient.id },
    include: { visits: true, consultations: true, labRequests: { include: { items: true } },
               stockMovements: true, charges: true, invoices: { include: { payments: true, charges: true } } },
  });
  assert.equal(dossier.visits.length, 1);
  assert.equal(dossier.consultations.length, 1);
  assert.equal(dossier.labRequests[0].items.length, 1);
  assert.equal(dossier.stockMovements[0].type, "PATIENT_CONSUMPTION");
  assert.equal(dossier.invoices[0].charges.length, 1);
  assert.equal(dossier.invoices[0].payments[0].amount.toString(), "0.2");
  // Une facture n'est pas un paiement : statut ISSUED, payé partiellement seulement.
  assert.equal(dossier.invoices[0].status, "ISSUED");
});

test("le journal d'audit refuse modification, suppression et vidage", async () => {
  const log = await db.auditLog.create({ data: { action: "TEST", module: "tests", userId: ctx.user.id } });
  await rejects(db.auditLog.update({ where: { id: log.id }, data: { action: "FALSIFIE" } }), /CMDPRO_IMMUTABLE/);
  await rejects(db.auditLog.delete({ where: { id: log.id } }), /CMDPRO_IMMUTABLE/);
  await rejects(db.$executeRawUnsafe('TRUNCATE "AuditLog" CASCADE'), /CMDPRO_IMMUTABLE/);
});

test("paiements et mouvements de stock ne peuvent pas être modifiés", async () => {
  const p = await db.payment.findFirst({ where: { invoiceId: ctx.invoice.id } });
  await rejects(db.payment.update({ where: { id: p.id }, data: { amount: "999" } }), /CMDPRO_IMMUTABLE/);
  await rejects(db.payment.delete({ where: { id: p.id } }), /CMDPRO_IMMUTABLE/);
  const m = await db.stockMovement.findFirst({ where: { productId: ctx.product.id } });
  await rejects(db.stockMovement.delete({ where: { id: m.id } }), /CMDPRO_IMMUTABLE/);
});

test("une extourne de paiement est une nouvelle ligne négative liée à l'originale", async () => {
  const p = await db.payment.findFirst({ where: { invoiceId: ctx.invoice.id } });
  await rejects(
    db.payment.create({ data: { number: `NEG-${run}`, invoiceId: ctx.invoice.id, amount: "-0.20", currency: "USD", amountInInvoiceCcy: "-0.20", cashierId: ctx.user.id } }),
    /payment_negative_only_reversal/,
  );
  const rev = await db.payment.create({
    data: { number: `REV-${run}`, invoiceId: ctx.invoice.id, amount: "-0.20", currency: "USD", amountInInvoiceCcy: "-0.20",
            cashierId: ctx.user.id, reversalOfId: p.id, reversalReason: "Erreur de saisie (TEST)" },
  });
  assert.equal(rev.reversalOfId, p.id);
  await rejects( // on ne peut pas extourner deux fois
    db.payment.create({ data: { number: `REV2-${run}`, invoiceId: ctx.invoice.id, amount: "-0.20", currency: "USD", amountInInvoiceCcy: "-0.20", cashierId: ctx.user.id, reversalOfId: p.id } }),
    /Unique constraint/,
  );
});

test("le stock ne peut jamais devenir négatif", async () => {
  await rejects(
    db.product.update({ where: { id: ctx.product.id }, data: { quantityOnHand: { decrement: 100 } } }),
    /product_qty_non_negative/,
  );
});

test("un lit n'accueille qu'un séjour ouvert ; un patient n'a qu'une admission active", async () => {
  const room = await db.room.create({ data: { code: `R-${run}`, name: "Chambre TEST", category: "TEST" } });
  const bed = await db.bed.create({ data: { roomId: room.id, code: "L1" } });
  const p2 = await db.patient.create({ data: { patientNumber: `P2-${run}`, firstName: "Fictif2", lastName: "PATIENT-TEST" } });
  const a1 = await db.admission.create({ data: { patientId: ctx.patient.id, type: "HOSPITALIZATION", admittedById: ctx.user.id } });
  const a2 = await db.admission.create({ data: { patientId: p2.id, type: "EMERGENCY", admittedById: ctx.user.id } });
  await rejects(
    db.admission.create({ data: { patientId: ctx.patient.id, type: "EMERGENCY", admittedById: ctx.user.id } }),
    /Unique constraint/,
  );
  const b1 = await db.bedAssignment.create({ data: { admissionId: a1.id, bedId: bed.id, assignedById: ctx.user.id } });
  await rejects(
    db.bedAssignment.create({ data: { admissionId: a2.id, bedId: bed.id, assignedById: ctx.user.id } }),
    /Unique constraint/,
  );
  await db.bedAssignment.update({ where: { id: b1.id }, data: { endAt: new Date() } });
  await db.bedAssignment.create({ data: { admissionId: a2.id, bedId: bed.id, assignedById: ctx.user.id } });
});

test("une seule demande de crédit en attente par facture", async () => {
  const base = { invoiceId: ctx.invoice.id, patientId: ctx.patient.id, amount: "0.30", currency: "USD", reason: "TEST", requestedById: ctx.user.id };
  const c1 = await db.creditRequest.create({ data: base });
  await rejects(db.creditRequest.create({ data: base }), /Unique constraint/);
  await db.creditRequest.update({ where: { id: c1.id }, data: { status: "REJECTED", decidedById: ctx.user.id, decidedAt: new Date() } });
  await db.creditRequest.create({ data: base }); // nouvelle demande possible après décision
});

test("une session appartient soit à un employé, soit à un patient", async () => {
  const acc = await db.patientAccount.create({ data: { patientId: ctx.patient.id, username: `pt-${run}`, passwordHash: "x" } });
  const exp = new Date(Date.now() + 3600e3);
  await rejects(
    db.session.create({ data: { tokenHash: `a-${run}`, userId: ctx.user.id, patientAccountId: acc.id, expiresAt: exp } }),
    /session_one_owner/,
  );
  await rejects(db.session.create({ data: { tokenHash: `b-${run}`, expiresAt: exp } }), /session_one_owner/);
});

test("une nouvelle spécialité s'ajoute sans modifier le schéma, avec formulaire versionné", async () => {
  const s = await db.specialty.create({ data: { code: `NEW-${run}`, name: "Nouvelle spécialité TEST" } });
  const f = { context: "CONSULTATION", specialtyId: s.id, name: "Consultation", fields: [{ key: "obs", label: "Observation", type: "text" }] };
  await db.formTemplate.create({ data: { ...f, version: 1 } });
  await db.formTemplate.create({ data: { ...f, version: 2 } });
  await rejects(db.formTemplate.create({ data: { ...f, version: 2 } }), /Unique constraint/);
  await db.doctorAssignment.create({ data: { employeeId: ctx.emp.id, specialtyId: s.id } });
  await rejects(db.doctorAssignment.create({ data: { employeeId: ctx.emp.id, specialtyId: s.id } }), /Unique constraint/);
});

test("les bulletins de paie sont versionnés, jamais écrasés", async () => {
  const b = { employeeId: ctx.emp.id, period: "2026-10", currency: "USD", baseSalary: 100, bonuses: 0, deductions: 0,
              advances: 20, alreadyPaid: 0, netPayable: 80, balance: 80, generatedById: ctx.user.id };
  await db.payslip.create({ data: { ...b, version: 1 } });
  await rejects(db.payslip.create({ data: { ...b, version: 1 } }), /Unique constraint/);
  await db.payslip.create({ data: { ...b, version: 2, bonuses: 10, netPayable: 90, balance: 90 } });
  assert.equal(await db.payslip.count({ where: { employeeId: ctx.emp.id, period: "2026-10" } }), 2);
});

test("un utilisateur désactivé reste en base avec son historique", async () => {
  await db.user.update({ where: { id: ctx.user.id }, data: { status: "DISABLED" } });
  const u = await db.user.findUnique({ where: { id: ctx.user.id }, include: { auditLogs: true } });
  assert.equal(u.status, "DISABLED");
  assert.ok(u.auditLogs.length >= 1);
});
