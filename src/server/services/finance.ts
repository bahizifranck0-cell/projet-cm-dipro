import { z } from "zod";
import { Prisma, type Currency } from "@prisma/client";
import { db } from "../db";
import { assertCan, ForbiddenError, ValidationError, type Actor } from "../auth/actor";
import { audit } from "./audit";
import { notifyPermission } from "./notifications";
import { nextNumber } from "./sequences";
import { opt, parse, req } from "./validation";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const money = z.string().trim().regex(/^\d+([.,]\d{1,2})?$/, "Montant invalide (ex. 12.50).").transform((v) => D(v.replace(",", ".")));

export async function listCategories() { return db.expenseCategory.findMany({ orderBy: { name: "asc" } }); }
export async function createCategory(actor: Actor, name: string) {
  assertCan(actor, "finance", "update");
  const n = name?.trim();
  if (!n) throw new ValidationError("Le nom est obligatoire.", "name");
  if (await db.expenseCategory.findFirst({ where: { name: { equals: n, mode: "insensitive" } } })) throw new ValidationError("Cette catégorie existe déjà.", "name");
  const c = await db.expenseCategory.create({ data: { name: n } });
  await audit(actor, { action: "CREATE", module: "finance", entityType: "ExpenseCategory", entityId: c.id, details: { name: n } });
  return c;
}

// ── Plafonds de validation (configurables : aucune règle n'est imposée) ──
export async function listApprovalRules() { return db.approvalRule.findMany({ where: { module: "expenses", active: true }, include: { role: true } }); }
export async function setApprovalRule(actor: Actor, roleId: string, currency: Currency, maxAmount: string | null) {
  if (!actor.isSuperAdmin) assertCan(actor, "settings", "update");
  const max = maxAmount?.trim() ? parse(money, maxAmount) : null;
  await db.approvalRule.updateMany({ where: { module: "expenses", roleId, currency, active: true }, data: { active: false } });
  const r = await db.approvalRule.create({ data: { module: "expenses", roleId, currency, maxAmount: max } });
  await audit(actor, { action: "UPDATE", module: "settings", entityType: "ApprovalRule", entityId: r.id, details: { roleId, currency, maxAmount: max?.toString() ?? "sans plafond" } });
}

/** Une dépense est validable si le rôle du validateur a un plafond suffisant (quand des plafonds sont définis). */
async function canApproveAmount(actor: Actor, amount: Prisma.Decimal, currency: Currency) {
  if (actor.isSuperAdmin) return true;
  const rules = await db.approvalRule.findMany({ where: { module: "expenses", currency, active: true } });
  if (!rules.length) return true; // plafonds non encore définis par l'hôpital
  const mine = rules.find((r) => r.roleId === actor.roleId);
  return !!mine && (mine.maxAmount === null || mine.maxAmount.gte(amount));
}

// ── Dépenses de fonctionnement des services (jamais une consommation patient) ──
const expenseInput = z.object({ departmentId: req("Le service", 40), categoryId: req("La catégorie", 40), description: req("La description", 500), amount: money.refine((v) => v.gt(0), "Le montant doit être positif."), currency: z.enum(["USD", "CDF"]) });

export async function createExpense(actor: Actor, raw: unknown) {
  assertCan(actor, "finance", "create");
  const d = parse(expenseInput, raw);
  const y = new Date().getUTCFullYear();
  const e = await db.expense.create({ data: { ...d, number: `DEP-${y}-${String(await nextNumber(`DEP-${y}`)).padStart(5, "0")}`, requestedById: actor.userId, status: "SUBMITTED" } });
  await audit(actor, { action: "CREATE", module: "finance", entityType: "Expense", entityId: e.id, details: { amount: d.amount.toString(), currency: d.currency } });
  await notifyPermission("finance", "validate", { module: "finance", type: "EXPENSE", title: `Dépense à examiner (${e.number})`, body: d.description, entityType: "Expense", entityId: e.id, link: "/finance/depenses", dedupeKey: `exp:${e.id}` }, db, actor.userId);
  return e;
}

export async function decideExpense(actor: Actor, id: string, approve: boolean, note?: string) {
  assertCan(actor, "finance", "validate");
  const e = await db.expense.findUniqueOrThrow({ where: { id } });
  if (e.status !== "SUBMITTED") throw new ValidationError("Cette dépense a déjà été traitée.");
  if (e.requestedById === actor.userId && !actor.isSuperAdmin) throw new ForbiddenError("Une dépense ne peut pas être validée par la personne qui l'a saisie.");
  if (approve && !(await canApproveAmount(actor, e.amount, e.currency))) throw new ForbiddenError("Ce montant dépasse votre plafond de validation.");
  await db.expense.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
  await audit(actor, { action: approve ? "APPROVE" : "REJECT", module: "finance", entityType: "Expense", entityId: id, details: { note: note ?? null } });
}

export async function payExpense(actor: Actor, id: string) {
  assertCan(actor, "finance", "update");
  await db.$transaction(async (tx) => {
    const e = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (e.status !== "APPROVED") throw new ValidationError("Seule une dépense validée peut être payée.");
    await tx.expense.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), paidById: actor.userId } });
    await tx.ledgerEntry.create({ data: { type: "EXPENSE", amount: e.amount.neg(), currency: e.currency, departmentId: e.departmentId, sourceType: "EXPENSE", sourceId: e.id, description: `Dépense ${e.number} — ${e.description}`, createdById: actor.userId } });
    await audit(actor, { action: "PAY", module: "finance", entityType: "Expense", entityId: id }, tx);
  });
}

export async function listExpenses(actor: Actor, status?: string) {
  assertCan(actor, "finance", "view");
  return db.expense.findMany({ where: status ? { status: status as never } : {}, orderBy: { requestedAt: "desc" }, take: 200, include: { department: true, category: true } });
}

// ── Journal de caisse et réconciliation mensuelle ──
export function periodBounds(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new ValidationError("Période invalide (AAAA-MM).", "period");
  const [y, m] = period.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - 2 * 3600e3), to: new Date(Date.UTC(y, m, 1) - 2 * 3600e3) };
}

export async function cashJournal(actor: Actor, from: Date, to: Date, cashierId?: string) {
  if (!actor.isSuperAdmin && !actor.permissions.has("cash.view") && !actor.permissions.has("finance.view")) throw new ForbiddenError();
  const payments = await db.payment.findMany({ where: { receivedAt: { gte: from, lt: to }, cashierId }, orderBy: { receivedAt: "asc" }, include: { invoice: { include: { patient: true, sale: true } }, method: true } });
  const totals: Record<string, Prisma.Decimal> = {};
  for (const p of payments) totals[p.currency] = (totals[p.currency] ?? D(0)).add(p.amount);
  const cashiers = await db.user.findMany({ where: { id: { in: [...new Set(payments.map((p) => p.cashierId))] } }, select: { id: true, username: true } });
  return { payments, totals, cashierName: Object.fromEntries(cashiers.map((c) => [c.id, c.username])) };
}

export async function expectedCash(period: string, currency: Currency) {
  const { from, to } = periodBounds(period);
  const s = await db.payment.aggregate({ where: { receivedAt: { gte: from, lt: to }, currency, methodCode: "CASH" }, _sum: { amount: true } });
  const e = await db.ledgerEntry.aggregate({ where: { at: { gte: from, lt: to }, currency, type: "EXPENSE" }, _sum: { amount: true } });
  return (s._sum.amount ?? D(0)).add(e._sum.amount ?? D(0)); // encaissements − dépenses payées
}

export async function createReconciliation(actor: Actor, raw: { period: string; currency: Currency; counted: string; notes?: string }) {
  assertCan(actor, "finance", "create");
  const counted = parse(money, raw.counted);
  const expected = await expectedCash(raw.period, raw.currency);
  if (await db.cashReconciliation.findUnique({ where: { period_currency: { period: raw.period, currency: raw.currency } } })) throw new ValidationError("Une réconciliation existe déjà pour cette période et cette devise.");
  const r = await db.cashReconciliation.create({ data: { period: raw.period, currency: raw.currency, expectedAmount: expected, countedAmount: counted, difference: counted.sub(expected), notes: raw.notes?.trim() || null, preparedById: actor.userId } });
  await audit(actor, { action: "CREATE", module: "finance", entityType: "CashReconciliation", entityId: r.id, details: { period: raw.period, expected: expected.toString(), counted: counted.toString() } });
  return r;
}
export async function approveReconciliation(actor: Actor, id: string) {
  assertCan(actor, "finance", "validate");
  const r = await db.cashReconciliation.findUniqueOrThrow({ where: { id } });
  if (r.status !== "PENDING") throw new ValidationError("Déjà traitée.");
  if (r.preparedById === actor.userId && !actor.isSuperAdmin) throw new ForbiddenError("La réconciliation doit être validée par une autre personne.");
  await db.cashReconciliation.update({ where: { id }, data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() } });
  await audit(actor, { action: "APPROVE", module: "finance", entityType: "CashReconciliation", entityId: id });
}

/** Situation financière d'une période (recettes, dépenses, dettes ouvertes), par devise. */
export async function financialSummary(actor: Actor, from: Date, to: Date) {
  assertCan(actor, "finance", "view");
  const [ledger, invoiced, debts] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ["type", "currency"], where: { at: { gte: from, lt: to } }, _sum: { amount: true } }),
    db.invoice.groupBy({ by: ["currency"], where: { issuedAt: { gte: from, lt: to }, status: { not: "CANCELLED" } }, _sum: { total: true } }),
    db.debt.findMany({ where: { status: { not: "SETTLED" } }, include: { invoice: true } }),
  ]);
  const by = (t: string, c: string) => ledger.find((l) => l.type === t && l.currency === c)?._sum.amount ?? D(0);
  return (["USD", "CDF"] as const).map((c) => ({
    currency: c,
    revenue: by("REVENUE", c).add(by("REVERSAL", c)),
    expenses: by("EXPENSE", c).neg(),
    invoiced: invoiced.find((i) => i.currency === c)?._sum.total ?? D(0),
    openDebts: debts.filter((d) => d.currency === c).reduce((s, d) => s.add(d.invoice.total.sub(d.invoice.amountPaid)), D(0)),
  }));
}

export async function listLedger(actor: Actor, from: Date, to: Date) {
  assertCan(actor, "finance", "view");
  return db.ledgerEntry.findMany({ where: { at: { gte: from, lt: to } }, orderBy: { id: "desc" }, take: 500, include: { department: true } });
}
