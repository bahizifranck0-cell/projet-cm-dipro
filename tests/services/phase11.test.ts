import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError } from "../../src/server/auth/actor";
import * as hr from "../../src/server/services/hr";
import * as employees from "../../src/server/services/employees";
import { readDocumentForStaff } from "../../src/server/services/documents";
import { actorWithRole, freshSeed } from "../helpers";

type A = Awaited<ReturnType<typeof actorWithRole>>;
let adm: A, cashier: A, adm2: A;
let empId = "";
const P = "2026-10";
before(async () => {
  await freshSeed();
  [adm, cashier, adm2] = await Promise.all([actorWithRole("ADMINISTRATION"), actorWithRole("CAISSIER"), actorWithRole("SUPER_ADMIN", { superAdmin: true })]);
  empId = (await employees.createEmployee(adm.actor, { firstName: "Esther", lastName: "Kavira", position: "Infirmière" })).id;
});
after(() => db.$disconnect());

test("contrat : salaire de base, l'ancien contrat est conservé", async () => {
  await assert.rejects(hr.addContract(cashier.actor, empId, { type: "CDI", startDate: "2026-01-01", baseSalary: "300", currency: "USD" }), ForbiddenError);
  await hr.addContract(adm.actor, empId, { type: "CDD", startDate: "2025-01-01", baseSalary: "250", currency: "USD" });
  await hr.addContract(adm.actor, empId, { type: "CDI", startDate: "2026-01-01", baseSalary: "300", currency: "USD" });
  const all = await db.employeeContract.findMany({ where: { employeeId: empId } });
  assert.equal(all.length, 2); assert.equal(all.filter((c) => c.active).length, 1);
});

test("avance, prime, déduction : calcul de la paie", async () => {
  await hr.addPayrollItem(adm.actor, empId, { period: P, type: "ADVANCE", amount: "50", currency: "USD", description: "Avance du 10" });
  await hr.addPayrollItem(adm.actor, empId, { period: P, type: "BONUS", amount: "20", currency: "USD" });
  await hr.addPayrollItem(adm.actor, empId, { period: P, type: "DEDUCTION", amount: "10", currency: "USD" });
  await hr.addPayrollItem(adm.actor, empId, { period: P, type: "WORK_EXPENSE", amount: "15", currency: "USD", description: "Transport mission" });
  await assert.rejects(hr.addPayrollItem(adm.actor, empId, { period: P, type: "BONUS", amount: "5000", currency: "CDF" }), /contrat est en USD/);
  const c = await hr.computePayroll(empId, P);
  assert.equal(c.netPayable.toString(), "260", "300 + 20 − 10 − 50");
  assert.equal(c.balance.toString(), "260");
  assert.equal(await db.ledgerEntry.count({ where: { sourceType: { startsWith: "HR_" } } }), 2, "avance et dépense professionnelle = sorties d'argent");
});

test("bulletins versionnés : une régénération ne remplace jamais l'ancien", async () => {
  const v1 = await hr.generatePayslip(adm.actor, empId, P);
  await hr.addPayrollItem(adm.actor, empId, { period: P, type: "SALARY_PAYMENT", amount: "200", currency: "USD" });
  const v2 = await hr.generatePayslip(adm.actor, empId, P);
  assert.equal(v1.version, 1); assert.equal(v2.version, 2);
  assert.equal(v2.balance.toString(), "60", "260 − 200 déjà payés");
  assert.equal((await db.payslip.findUniqueOrThrow({ where: { id: v1.id } })).balance.toString(), "260", "version 1 intacte");
  const doc = await readDocumentForStaff(adm.actor, v2.documentId!);
  assert.equal(doc!.data.subarray(0, 5).toString(), "%PDF-");
  await assert.rejects(readDocumentForStaff(cashier.actor, v2.documentId!), ForbiddenError, "bulletin confidentiel");
});

test("annulation d'une opération : tracée, extournée au journal, recalcul", async () => {
  const adv = await db.payrollItem.findFirstOrThrow({ where: { employeeId: empId, type: "ADVANCE" } });
  await assert.rejects(hr.cancelPayrollItem(adm.actor, adv.id, ""), /motif/);
  await hr.cancelPayrollItem(adm.actor, adv.id, "Erreur de montant");
  assert.equal((await hr.computePayroll(empId, P)).netPayable.toString(), "310");
  assert.ok(await db.ledgerEntry.findFirst({ where: { sourceType: "HR_CANCEL", sourceId: adv.id } }));
  await assert.rejects(hr.cancelPayrollItem(adm.actor, adv.id, "x"), /Déjà annulé/);
});

test("congés : demande puis décision par une autre personne", async () => {
  const l = await hr.requestLeave(adm.actor, empId, { type: "Congé annuel", startDate: "2026-12-01", endDate: "2026-12-10" });
  await assert.rejects(hr.requestLeave(adm.actor, empId, { type: "X", startDate: "2026-12-10", endDate: "2026-12-01" }), /précède/);
  await assert.rejects(hr.decideLeave(adm.actor, l.id, true), ForbiddenError, "l'Administration n'a pas « RH — Valider » par défaut");
  await hr.decideLeave(adm2.actor, l.id, true);
  assert.equal((await db.leaveRequest.findUniqueOrThrow({ where: { id: l.id } })).status, "APPROVED");
});
