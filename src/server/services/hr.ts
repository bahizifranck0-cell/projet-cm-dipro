import { z } from "zod";
import { Prisma, type Currency, type PayrollItemType } from "@prisma/client";
import { db } from "../db";
import { assertCan, ForbiddenError, ValidationError, type Actor, can } from "../auth/actor";
import { createPdf, fields as pdfFields, section, table, paragraph, signature } from "../pdf";
import { audit } from "./audit";
import { documentNumber, storeDocument } from "./documents";
import { fmtMoney } from "./billing";
import { opt, parse, req } from "./validation";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const money = z.string().trim().regex(/^\d+([.,]\d{1,2})?$/, "Montant invalide (ex. 120.00).").transform((v) => D(v.replace(",", ".")));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.").transform((v) => new Date(`${v}T00:00:00Z`));
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Période invalide (AAAA-MM).");

export const PAYROLL_TYPE: Record<PayrollItemType, string> = { ADVANCE: "Avance", BONUS: "Prime", DEDUCTION: "Déduction", SALARY_PAYMENT: "Paiement de salaire", WORK_EXPENSE: "Dépense professionnelle" };

export async function getEmployee(actor: Actor, id: string) {
  if (!can(actor, "hr", "view") && actor.employeeId !== id) throw new ForbiddenError();
  return db.employee.findUnique({
    where: { id },
    include: {
      department: true, user: { select: { id: true, username: true, status: true, role: { select: { name: true } } } },
      contracts: { orderBy: { startDate: "desc" } }, payrollItems: { orderBy: { createdAt: "desc" } },
      payslips: { orderBy: [{ period: "desc" }, { version: "desc" }] }, leaves: { orderBy: { startDate: "desc" } },
    },
  });
}

const empInput = z.object({ firstName: req("Le prénom", 60), lastName: req("Le nom", 60), postName: opt(60), phone: opt(30), email: opt(120), address: opt(200), position: req("La fonction", 80), departmentId: opt(40), status: z.enum(["ACTIVE", "SUSPENDED", "LEFT"]) });
export async function updateEmployee(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "hr", "update");
  const d = parse(empInput, raw);
  const before = await db.employee.findUniqueOrThrow({ where: { id } });
  await db.employee.update({ where: { id }, data: { ...d, postName: d.postName ?? null, phone: d.phone ?? null, email: d.email ?? null, address: d.address ?? null, departmentId: d.departmentId ?? null } });
  const changed = Object.keys(d).filter((k) => String((before as Record<string, unknown>)[k] ?? "") !== String((d as Record<string, unknown>)[k] ?? ""));
  await audit(actor, { action: "UPDATE", module: "hr", entityType: "Employee", entityId: id, details: { changed } });
}

const contractInput = z.object({ type: req("Le type de contrat", 60), startDate: date, endDate: z.string().optional().transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null)), baseSalary: money, currency: z.enum(["USD", "CDF"]) });
export async function addContract(actor: Actor, employeeId: string, raw: unknown) {
  assertCan(actor, "hr", "create");
  const d = parse(contractInput, raw);
  if (d.endDate && d.endDate < d.startDate) throw new ValidationError("La date de fin précède la date de début.", "endDate");
  const c = await db.$transaction(async (tx) => {
    await tx.employeeContract.updateMany({ where: { employeeId, active: true }, data: { active: false } }); // l'ancien contrat est conservé
    return tx.employeeContract.create({ data: { employeeId, ...d } });
  });
  await audit(actor, { action: "CREATE", module: "hr", entityType: "EmployeeContract", entityId: c.id, details: { employeeId, baseSalary: d.baseSalary.toString(), currency: d.currency } });
  return c;
}

const itemInput = z.object({ period, type: z.enum(["ADVANCE", "BONUS", "DEDUCTION", "SALARY_PAYMENT", "WORK_EXPENSE"]), amount: money.refine((v) => v.gt(0), "Le montant doit être positif."), currency: z.enum(["USD", "CDF"]), description: opt(300) });
/** Avances, primes, déductions, paiements : chacun est une opération distincte et tracée. */
export async function addPayrollItem(actor: Actor, employeeId: string, raw: unknown) {
  assertCan(actor, "hr", "create");
  const d = parse(itemInput, raw);
  const contract = await db.employeeContract.findFirst({ where: { employeeId, active: true } });
  if (d.type !== "WORK_EXPENSE" && contract && contract.currency !== d.currency) throw new ValidationError(`Le contrat est en ${contract.currency} : saisissez le montant dans la même devise.`, "currency");
  const item = await db.$transaction(async (tx) => {
    const i = await tx.payrollItem.create({ data: { employeeId, ...d, createdById: actor.userId } });
    // Sorties d'argent réelles inscrites au journal financier
    if (d.type === "ADVANCE" || d.type === "SALARY_PAYMENT" || d.type === "WORK_EXPENSE")
      await tx.ledgerEntry.create({ data: { type: "EXPENSE", amount: d.amount.neg(), currency: d.currency, sourceType: `HR_${d.type}`, sourceId: i.id, description: `${PAYROLL_TYPE[d.type]} — employé ${employeeId} — ${d.period}`, createdById: actor.userId } });
    await audit(actor, { action: "PAYROLL_ITEM", module: "hr", entityType: "PayrollItem", entityId: i.id, details: { employeeId, type: d.type, amount: d.amount.toString(), period: d.period } }, tx);
    return i;
  });
  return item;
}

export async function cancelPayrollItem(actor: Actor, itemId: string, reason: string) {
  assertCan(actor, "hr", "update");
  if (!reason?.trim()) throw new ValidationError("Le motif est obligatoire.", "reason");
  await db.$transaction(async (tx) => {
    const i = await tx.payrollItem.findUniqueOrThrow({ where: { id: itemId } });
    if (i.cancelledAt) throw new ValidationError("Déjà annulé.");
    await tx.payrollItem.update({ where: { id: itemId }, data: { cancelledAt: new Date(), cancelledById: actor.userId, cancelReason: reason.trim() } });
    const l = await tx.ledgerEntry.findFirst({ where: { sourceId: itemId } });
    if (l) await tx.ledgerEntry.create({ data: { type: "REVERSAL", amount: l.amount.neg(), currency: l.currency, sourceType: "HR_CANCEL", sourceId: itemId, description: `Annulation : ${reason.trim()}`, createdById: actor.userId, reversesId: l.id } });
    await audit(actor, { action: "CANCEL", module: "hr", entityType: "PayrollItem", entityId: itemId, details: { reason } }, tx);
  });
}

/** Calcul de la paie : salaire + primes − déductions − avances ; solde = net − déjà payé. */
export async function computePayroll(employeeId: string, p: string) {
  parse(period, p);
  const [y, m] = p.split("-").map(Number);
  const periodEnd = new Date(Date.UTC(y, m, 0));
  const contract = await db.employeeContract.findFirst({ where: { employeeId, startDate: { lte: periodEnd } }, orderBy: { startDate: "desc" } });
  if (!contract) throw new ValidationError("Aucun contrat (salaire de base) pour cet employé à cette période.");
  const items = await db.payrollItem.findMany({ where: { employeeId, period: p, cancelledAt: null, type: { not: "WORK_EXPENSE" } } });
  const sum = (t: PayrollItemType) => items.filter((i) => i.type === t).reduce((s, i) => s.add(i.amount), D(0));
  const baseSalary = contract.baseSalary, bonuses = sum("BONUS"), deductions = sum("DEDUCTION"), advances = sum("ADVANCE"), alreadyPaid = sum("SALARY_PAYMENT");
  const netPayable = baseSalary.add(bonuses).sub(deductions).sub(advances);
  return { currency: contract.currency as Currency, baseSalary, bonuses, deductions, advances, alreadyPaid, netPayable, balance: netPayable.sub(alreadyPaid), items };
}

/** Bulletin à la demande : chaque génération crée une NOUVELLE version, l'ancienne est conservée. */
export async function generatePayslip(actor: Actor, employeeId: string, p: string) {
  assertCan(actor, "hr", "create");
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { department: true } });
  const c = await computePayroll(employeeId, p);
  const last = await db.payslip.findFirst({ where: { employeeId, period: p }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  const number = await documentNumber("PAYSLIP");
  const pdf = await createPdf({ title: "Bulletin de paie", reference: `${number} (v${version})`, date: new Date(), subtitle: `Période ${p}` }, (doc) => {
    pdfFields(doc, [["Employé", `${emp.lastName.toUpperCase()} ${emp.postName ?? ""} ${emp.firstName}`], ["Matricule", emp.matricule], ["Fonction", emp.position], ["Service", emp.department?.name]]);
    section(doc, "Calcul");
    table(doc, ["Élément", "Montant"], [345, 150], [["Salaire de base", fmtMoney(c.baseSalary, c.currency)], ["Primes", fmtMoney(c.bonuses, c.currency)], ["Déductions", `− ${fmtMoney(c.deductions, c.currency)}`], ["Avances", `− ${fmtMoney(c.advances, c.currency)}`], ["Net à payer", fmtMoney(c.netPayable, c.currency)], ["Déjà payé", fmtMoney(c.alreadyPaid, c.currency)], ["Solde restant", fmtMoney(c.balance, c.currency)]], ["left", "right"]);
    if (c.items.length) { section(doc, "Détail des opérations"); table(doc, ["Date", "Type", "Description", "Montant"], [80, 120, 195, 100], c.items.map((i) => [i.createdAt.toLocaleDateString("fr-FR"), PAYROLL_TYPE[i.type], i.description ?? "", fmtMoney(i.amount, i.currency)]), ["left", "left", "left", "right"]); }
    if (version > 1) paragraph(doc, `Version ${version} : remplace l'affichage des versions précédentes, qui restent conservées.`);
    signature(doc, "Pour la direction", "");
  });
  const docRow = await storeDocument({ type: "PAYSLIP", title: `Bulletin ${p} — ${emp.lastName.toUpperCase()} ${emp.firstName} (v${version})`, pdf, number, createdById: actor.userId, employeeId, entityType: "Payslip", entityId: `${employeeId}:${p}` });
  const slip = await db.payslip.create({ data: { employeeId, period: p, version, currency: c.currency, baseSalary: c.baseSalary, bonuses: c.bonuses, deductions: c.deductions, advances: c.advances, alreadyPaid: c.alreadyPaid, netPayable: c.netPayable, balance: c.balance, generatedById: actor.userId, documentId: docRow.id } });
  await audit(actor, { action: "PAYSLIP", module: "hr", entityType: "Payslip", entityId: slip.id, details: { employeeId, period: p, version, net: c.netPayable.toString() } });
  return slip;
}

// Congés : architecture prête, règles détaillées à confirmer par l'administration.
const leaveInput = z.object({ type: req("Le type", 60), startDate: date, endDate: date, reason: opt(300) });
export async function requestLeave(actor: Actor, employeeId: string, raw: unknown) {
  if (!can(actor, "hr", "create") && actor.employeeId !== employeeId) throw new ForbiddenError();
  const d = parse(leaveInput, raw);
  if (d.endDate < d.startDate) throw new ValidationError("La date de fin précède la date de début.", "endDate");
  const l = await db.leaveRequest.create({ data: { employeeId, ...d } });
  await audit(actor, { action: "CREATE", module: "hr", entityType: "LeaveRequest", entityId: l.id });
  return l;
}
export async function decideLeave(actor: Actor, id: string, approve: boolean) {
  assertCan(actor, "hr", "validate");
  const l = await db.leaveRequest.findUniqueOrThrow({ where: { id } });
  if (l.status !== "PENDING") throw new ValidationError("Déjà traitée.");
  if (l.employeeId === actor.employeeId && !actor.isSuperAdmin) throw new ForbiddenError("Vous ne pouvez pas valider votre propre congé.");
  await db.leaveRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: new Date() } });
  await audit(actor, { action: approve ? "APPROVE" : "REJECT", module: "hr", entityType: "LeaveRequest", entityId: id });
}
