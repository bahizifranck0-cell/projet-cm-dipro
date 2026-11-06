// Module Caisse — transfert du module Caisse PREMIDIS (backend/routes/cash_routes.py) :
// sessions (ouverture avec fond, clôture avec billetage et écart), opérations d'entrée et de sortie,
// solde théorique, historique, rapport par catégorie. Écritures au journal financier et journal d'audit.
// Différences avec la source : une session par devise (USD et CDF), droits CMD Pro (module « cash »),
// encaissements de factures inscrits automatiquement dans la session ouverte (équivalent PREMIDIS « vente → caisse »).
import { z } from "zod";
import { Prisma, type CashOpType, type Currency } from "@prisma/client";
import { db, type Tx } from "../db";
import { assertCan, ForbiddenError, ValidationError, type Actor } from "../auth/actor";
import { audit } from "./audit";
import { notifyPermission } from "./notifications";
import { nextNumber } from "./sequences";
import { parse } from "./validation";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const money = z.string().trim().regex(/^\d+([.,]\d{1,2})?$/, "Montant invalide (ex. 12.50).").transform((v) => D(v.replace(",", ".")));
const optMoney = z.string().trim().transform((v) => v || "0").pipe(money);

export const CURRENCIES = ["USD", "CDF"] as const satisfies readonly Currency[];

/** Coupures du billetage (PREMIDIS : 100, 50, 20, 10, 5, 1 $). Franc congolais : coupures en circulation. */
export const DENOMINATIONS: Record<Currency, number[]> = {
  USD: [100, 50, 20, 10, 5, 1],
  CDF: [20000, 10000, 5000, 1000, 500, 200, 100, 50],
};

/** Moyens de paiement des opérations (PREMIDIS : cash, transfer, mobile). */
export const METHODS: Record<string, string> = { cash: "Espèces", transfer: "Virement", mobile: "Mobile money" };

/** Catégories PREMIDIS (entrées : other, apport, remboursement ; sorties : expense, transport…) + catégories automatiques. */
export const CATEGORIES: Record<CashOpType, Record<string, string>> = {
  IN: { other: "Autre entrée", apport: "Apport", remboursement: "Remboursement" },
  OUT: { expense: "Dépense", transport: "Transport", salaires: "Salaires", electricite: "Électricité", loyer: "Loyer", achats: "Achats", divers: "Divers" },
};
export const AUTO_CATEGORIES: Record<string, string> = { facture: "Encaissement de facture", dette: "Remboursement de dette", extourne: "Extourne d'encaissement" };
export const categoryLabel = (c: string) => CATEGORIES.IN[c] ?? CATEGORIES.OUT[c] ?? AUTO_CATEGORIES[c] ?? c;

const canRead = (a: Actor) => a.isSuperAdmin || a.permissions.has("cash.view") || a.permissions.has("finance.view");

async function opNumber(tx: Tx) {
  const y = new Date().getUTCFullYear();
  return `CAI-${y}-${String(await nextNumber(`CAI-${y}`, tx)).padStart(5, "0")}`;
}

async function totalsOf(sessionId: string, tx: Tx = db) {
  const g = await tx.cashOperation.groupBy({ by: ["type"], where: { sessionId }, _sum: { amount: true } });
  const sum = (t: CashOpType) => g.find((x) => x.type === t)?._sum.amount ?? D(0);
  return { totalIn: sum("IN"), totalOut: sum("OUT") };
}

export async function openSessionOf(currency: Currency, tx: Tx = db) {
  return tx.cashSession.findFirst({ where: { currency, closedAt: null }, orderBy: { openedAt: "desc" } });
}

/** Session ouverte avec ses totaux et le solde théorique (fond + entrées − sorties). */
export async function currentSession(actor: Actor, currency: Currency) {
  if (!canRead(actor)) throw new ForbiddenError();
  const s = await openSessionOf(currency);
  if (!s) return null;
  const { totalIn, totalOut } = await totalsOf(s.id);
  const opener = await db.user.findUnique({ where: { id: s.cashierId }, select: { username: true, employee: { select: { firstName: true, lastName: true } } } });
  return { ...s, totalIn, totalOut, expected: s.openingFloat.add(totalIn).sub(totalOut), openedByName: nameOf(opener) };
}

function nameOf(u: { username: string; employee: { firstName: string; lastName: string } | null } | null) {
  if (!u) return "—";
  return u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username;
}

export async function openSession(actor: Actor, raw: { currency: string; openingFloat: string; notes?: string }) {
  assertCan(actor, "cash", "create");
  const currency = parse(z.enum(CURRENCIES, { message: "Devise inconnue." }), raw.currency);
  const openingFloat = parse(optMoney, raw.openingFloat ?? "");
  try {
    return await db.$transaction(async (tx) => {
      if (await openSessionOf(currency, tx)) throw new ValidationError(`Une session ${currency} est déjà ouverte.`);
      const s = await tx.cashSession.create({ data: { cashierId: actor.userId, currency, openingFloat, notes: raw.notes?.trim() || null } });
      await audit(actor, { action: "OPEN", module: "cash", entityType: "CashSession", entityId: s.id, details: { summary: `Ouverture session caisse (fond ${openingFloat.toFixed(2)} ${currency})` } }, tx);
      return s;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationError(`Une session ${currency} est déjà ouverte.`);
    throw e;
  }
}

/** Clôture : billetage (coupure × nombre), compté, écart ; notification à la Finance en cas d'écart. */
export async function closeSession(actor: Actor, raw: { currency: string; counts: Record<string, string>; notes?: string }) {
  assertCan(actor, "cash", "create");
  const currency = parse(z.enum(CURRENCIES), raw.currency);
  const denoms = DENOMINATIONS[currency].map((denomination) => {
    const v = (raw.counts[String(denomination)] ?? "").trim() || "0";
    if (!/^\d{1,6}$/.test(v)) throw new ValidationError(`Nombre de billets invalide pour ${denomination}.`, `count_${denomination}`);
    return { denomination, count: Number(v) };
  });
  const counted = denoms.reduce((a, d) => a.add(D(d.denomination).mul(d.count)), D(0));
  const result = await db.$transaction(async (tx) => {
    const s = await openSessionOf(currency, tx);
    if (!s) throw new ValidationError("Aucune session ouverte.");
    await tx.$queryRaw`SELECT id FROM "CashSession" WHERE id = ${s.id} FOR UPDATE`;
    const { totalIn, totalOut } = await totalsOf(s.id, tx);
    const expected = s.openingFloat.add(totalIn).sub(totalOut);
    const difference = counted.sub(expected);
    const closed = await tx.cashSession.update({ where: { id: s.id }, data: {
      closedAt: new Date(), closedById: actor.userId, totalIn, totalOut, expectedAmount: expected, countedAmount: counted,
      difference, denominations: denoms, notes: raw.notes?.trim() || s.notes,
    } });
    await audit(actor, { action: "CLOSE", module: "cash", entityType: "CashSession", entityId: s.id, details: { summary: `Clôture caisse : attendu ${expected.toFixed(2)}, compté ${counted.toFixed(2)}, écart ${difference.toFixed(2)} ${currency}` } }, tx);
    if (difference.abs().gt(0.01)) {
      await notifyPermission("finance", "validate", {
        module: "finance", type: "cash_variance", title: "Écart de caisse",
        body: `Écart de ${difference.gt(0) ? "+" : ""}${difference.toFixed(2)} ${currency} lors de la clôture`,
        link: "/caisse?vue=historique", entityType: "CashSession", entityId: s.id, dedupeKey: `cash-variance-${s.id}`,
      }, tx);
    }
    return closed;
  });
  return result;
}

/** Entrée ou sortie de caisse saisie à la main (PREMIDIS create_operation) + écriture au journal financier. */
export async function createOperation(actor: Actor, raw: { type: string; currency: string; amount: string; category: string; method: string; description?: string }) {
  assertCan(actor, "cash", "create");
  const type = parse(z.enum(["IN", "OUT"], { message: "Type d'opération inconnu." }), raw.type);
  const currency = parse(z.enum(CURRENCIES, { message: "Devise inconnue." }), raw.currency);
  const amount = parse(money.refine((v) => v.gt(0), "Le montant doit être positif."), raw.amount ?? "");
  if (!CATEGORIES[type][raw.category]) throw new ValidationError("Catégorie inconnue.", "category");
  if (!METHODS[raw.method]) throw new ValidationError("Méthode inconnue.", "method");
  const description = raw.description?.trim() || null;
  return db.$transaction(async (tx) => {
    const session = await openSessionOf(currency, tx);
    const op = await tx.cashOperation.create({ data: { number: await opNumber(tx), sessionId: session?.id ?? null, type, category: raw.category, amount, currency, method: raw.method, description, createdById: actor.userId } });
    await tx.ledgerEntry.create({ data: {
      type: type === "IN" ? "REVENUE" : "EXPENSE", amount: type === "IN" ? amount : amount.neg(), currency,
      sourceType: "CASH_OPERATION", sourceId: op.id, createdById: actor.userId,
      description: description ?? `${type === "IN" ? "Entrée caisse" : "Dépense"} (${categoryLabel(raw.category)}) — ${op.number}`,
    } });
    await audit(actor, { action: type === "IN" ? "CASH_IN" : "CASH_OUT", module: "cash", entityType: "CashOperation", entityId: op.id, details: { summary: `${type === "IN" ? "Entrée" : "Sortie"} caisse ${amount.toFixed(2)} ${currency} — ${categoryLabel(raw.category)}` } }, tx);
    return op;
  });
}

/**
 * Lien avec la facturation (PREMIDIS : validation de vente → opération de caisse « sale »).
 * Appelé dans la transaction d'un encaissement ou d'une extourne. Le journal financier est déjà
 * écrit par la facturation : aucune écriture en double ici.
 */
export async function recordInvoiceCash(tx: Tx, p: { paymentId: string; sessionId: string | null; type: CashOpType; category: "facture" | "dette" | "extourne"; amount: Prisma.Decimal; currency: Currency; method: string; description: string; userId: string }) {
  return tx.cashOperation.create({ data: { number: await opNumber(tx), sessionId: p.sessionId, type: p.type, category: p.category, amount: p.amount.abs(), currency: p.currency, method: p.method, description: p.description, paymentId: p.paymentId, createdById: p.userId } });
}

export async function listOperations(actor: Actor, f: { sessionId?: string; type?: CashOpType; category?: string; take?: number }) {
  if (!canRead(actor)) throw new ForbiddenError();
  const ops = await db.cashOperation.findMany({ where: { sessionId: f.sessionId, type: f.type, category: f.category }, orderBy: { createdAt: "desc" }, take: Math.min(f.take ?? 300, 1000) });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ops.map((o) => o.createdById))] } }, select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } } });
  const by = Object.fromEntries(users.map((u) => [u.id, nameOf(u)]));
  return ops.map((o) => ({ ...o, createdByName: by[o.createdById] ?? "—" }));
}

export async function listSessions(actor: Actor, take = 50) {
  if (!canRead(actor)) throw new ForbiddenError();
  const ss = await db.cashSession.findMany({ orderBy: { openedAt: "desc" }, take: Math.min(take, 200), include: { _count: { select: { operations: true } } } });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ss.flatMap((s) => [s.cashierId, s.closedById ?? ""]))] } }, select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } } });
  const by = Object.fromEntries(users.map((u) => [u.id, nameOf(u)]));
  return ss.map((s) => ({ ...s, openedByName: by[s.cashierId] ?? "—", closedByName: s.closedById ? by[s.closedById] ?? "—" : null }));
}

/** Rapport de caisse d'une période (PREMIDIS /reports/cash) : entrées, sorties, net, ventilation par catégorie. */
export async function cashReport(actor: Actor, from: Date, to: Date) {
  if (!canRead(actor)) throw new ForbiddenError();
  const g = await db.cashOperation.groupBy({ by: ["currency", "type", "category"], where: { createdAt: { gte: from, lt: to } }, _sum: { amount: true }, _count: true });
  return CURRENCIES.map((currency) => {
    const rows = g.filter((x) => x.currency === currency);
    const part = (t: CashOpType) => rows.filter((x) => x.type === t).map((x) => ({ category: x.category, label: categoryLabel(x.category), amount: x._sum.amount ?? D(0), count: x._count })).sort((a, b) => b.amount.cmp(a.amount));
    const sum = (t: CashOpType) => part(t).reduce((a, x) => a.add(x.amount), D(0));
    return { currency, totalIn: sum("IN"), totalOut: sum("OUT"), net: sum("IN").sub(sum("OUT")), inByCategory: part("IN"), outByCategory: part("OUT") };
  });
}
