import { z } from "zod";
import { Prisma, type Currency, type InvoiceStatus } from "@prisma/client";
import { db, type Tx } from "../db";
import { assertCan, can, ForbiddenError, ValidationError, type Actor } from "../auth/actor";
import { createPdf, fields as pdfFields, section, table, paragraph, signature } from "../pdf";
import { audit } from "./audit";
import { documentNumber, storeDocument } from "./documents";
import { notify, notifyPermission } from "./notifications";
import { displayName } from "./patients";
import { nextNumber } from "./sequences";
import { opt, parse, req } from "./validation";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const r2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const money = z.string().trim().regex(/^\d+([.,]\d{1,2})?$/, "Montant invalide (ex. 12.50).").transform((v) => D(v.replace(",", ".")));
export const fmtMoney = (v: Prisma.Decimal.Value, c: string) => `${Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;

export const INVOICE_STATUS: Record<InvoiceStatus, string> = { DRAFT: "Brouillon", ISSUED: "À payer", PARTIALLY_PAID: "Payée en partie", PAID: "Payée", CANCELLED: "Annulée" };

// ── Taux de change (USD → CDF), historisé ──
export async function currentRate(tx: Tx = db) {
  return (await tx.exchangeRate.findFirst({ orderBy: { effectiveAt: "desc" } }))?.rate ?? null;
}
export async function setRate(actor: Actor, raw: string) {
  assertCan(actor, "finance", "update");
  const rate = parse(money.refine((v) => v.gt(0), "Le taux doit être positif."), raw);
  await db.exchangeRate.create({ data: { rate, setById: actor.userId } });
  await audit(actor, { action: "RATE", module: "finance", entityType: "ExchangeRate", details: { rate: rate.toString() } });
}
/** Conversion entre USD et CDF au taux donné (1 USD = rate CDF). */
export function convert(amount: Prisma.Decimal, from: Currency, to: Currency, rate: Prisma.Decimal | null) {
  if (from === to) return amount;
  if (!rate) throw new ValidationError("Aucun taux de change USD/CDF n'est défini : la Finance doit le saisir.");
  return r2(from === "USD" ? amount.mul(rate) : amount.div(rate));
}

// ── Catalogue tarifaire officiel ──
const tariffInput = z.object({ code: req("Le code", 30), name: req("Le libellé", 120), category: z.enum(["CONSULTATION", "EXAM", "LAB", "HOSPITALIZATION", "MEDICAL_SERVICE", "OTHER"]), price: money, currency: z.enum(["USD", "CDF"]), unit: opt(20), specialtyId: opt(40), departmentId: opt(40) });
export async function listTariffs() { return db.tariffItem.findMany({ orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }], include: { specialty: true, department: true } }); }
export async function saveTariff(actor: Actor, raw: unknown, id?: string) {
  assertCan(actor, "billing", id ? "update" : "create");
  const d = parse(tariffInput, raw);
  const code = d.code.toUpperCase();
  if (await db.tariffItem.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } })) throw new ValidationError("Ce code existe déjà.", "code");
  const data = { ...d, code, unit: d.unit ?? "acte", specialtyId: d.specialtyId ?? null, departmentId: d.departmentId ?? null };
  const before = id ? await db.tariffItem.findUnique({ where: { id } }) : null;
  const t = id ? await db.tariffItem.update({ where: { id }, data }) : await db.tariffItem.create({ data });
  await audit(actor, { action: id ? "UPDATE" : "CREATE", module: "billing", entityType: "TariffItem", entityId: t.id, details: { code, price: d.price.toString(), currency: d.currency, previous: before ? `${before.price} ${before.currency}` : null } });
  return t;
}
export async function setTariffActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "billing", "update");
  await db.tariffItem.update({ where: { id }, data: { active } });
  await audit(actor, { action: active ? "ACTIVATE" : "DEACTIVATE", module: "billing", entityType: "TariffItem", entityId: id });
}

// ── Compte du patient ──
export async function patientAccount(actor: Actor, patientId: string) {
  if (!["billing", "cash", "credit", "finance"].some((m) => can(actor, m as "billing", "view"))) throw new ForbiddenError();
  const [charges, invoices, debts] = await Promise.all([
    db.charge.findMany({ where: { patientId, status: "ACTIVE", invoiceId: null }, orderBy: { createdAt: "asc" }, include: { department: true } }),
    db.invoice.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, include: { payments: true, creditRequests: true, debt: true, discounts: true } }),
    db.debt.findMany({ where: { patientId }, include: { invoice: true } }),
  ]);
  return { charges, invoices, debts };
}

const canInvoice = (a: Actor) => can(a, "billing", "create") || can(a, "cash", "create");

/** Facture globale : regroupe toutes les prestations non facturées du patient. Une facture n'est PAS un paiement. */
export async function createPatientInvoice(actor: Actor, patientId: string, currency: Currency) {
  if (!canInvoice(actor)) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    // Verrouille les prestations : deux caisses ne peuvent pas facturer deux fois la même chose
    const charges = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Charge" WHERE "patientId" = ${patientId} AND status = 'ACTIVE' AND "invoiceId" IS NULL FOR UPDATE`;
    if (!charges.length) throw new ValidationError("Aucune prestation à facturer pour ce patient.");
    const rows = await tx.charge.findMany({ where: { id: { in: charges.map((c) => c.id) } } });
    const rate = rows.some((c) => c.currency !== currency) ? await currentRate(tx) : null;
    let subtotal = D(0);
    const y = new Date().getUTCFullYear();
    const inv = await tx.invoice.create({ data: { number: `FAC-${y}-${String(await nextNumber(`FAC-${y}`, tx)).padStart(5, "0")}`, type: "PATIENT", patientId, currency, subtotal: 0, total: 0, status: "ISSUED", issuedAt: new Date(), issuedById: actor.userId, exchangeRate: rate } });
    for (const c of rows) {
      const amt = convert(c.total, c.currency, currency, rate);
      subtotal = subtotal.add(amt);
      await tx.charge.update({ where: { id: c.id }, data: { invoiceId: inv.id, amountInInvoiceCcy: amt } });
    }
    const out = await tx.invoice.update({ where: { id: inv.id }, data: { subtotal, total: subtotal } });
    await audit(actor, { action: "INVOICE", module: "billing", entityType: "Invoice", entityId: inv.id, details: { number: inv.number, total: subtotal.toString(), currency, lines: rows.length } }, tx);
    return out;
  });
}

function statusFor(total: Prisma.Decimal, paid: Prisma.Decimal): InvoiceStatus {
  if (paid.gte(total)) return "PAID";
  return paid.gt(0) ? "PARTIALLY_PAID" : "ISSUED";
}

async function refreshDebt(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { debt: true } });
  if (!inv.debt) return;
  const status = inv.amountPaid.gte(inv.total) ? "SETTLED" : inv.amountPaid.gt(0) ? "PARTIALLY_PAID" : "OPEN";
  await tx.debt.update({ where: { id: inv.debt.id }, data: { status, settledAt: status === "SETTLED" ? new Date() : null } });
}

/** Paiement réellement reçu (espèces par défaut). Plusieurs paiements partiels possibles. */
export async function recordPayment(actor: Actor, invoiceId: string, raw: { amount: string; currency: Currency; methodCode?: string; note?: string }) {
  assertCan(actor, "cash", "create");
  const amount = parse(money.refine((v) => v.gt(0), "Le montant doit être positif."), raw.amount);
  const method = await db.paymentMethod.findFirst({ where: { code: raw.methodCode ?? "CASH", active: true } });
  if (!method) throw new ValidationError("Moyen de paiement non disponible.", "methodCode");
  const p = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new ValidationError("Facture introuvable.");
    if (inv.status === "CANCELLED" || inv.status === "PAID") throw new ValidationError(inv.status === "PAID" ? "Cette facture est déjà payée." : "Cette facture est annulée.");
    const rate = raw.currency !== inv.currency ? await currentRate(tx) : null;
    const inInvoice = convert(amount, raw.currency, inv.currency, rate);
    const balance = inv.total.sub(inv.amountPaid);
    if (inInvoice.gt(balance)) throw new ValidationError(`Le montant dépasse le reste à payer (${fmtMoney(balance, inv.currency)}). Rendez la monnaie au patient.`, "amount");
    const y = new Date().getUTCFullYear();
    const pay = await tx.payment.create({ data: { number: `REC-${y}-${String(await nextNumber(`REC-${y}`, tx)).padStart(5, "0")}`, invoiceId, amount, currency: raw.currency, exchangeRate: rate, amountInInvoiceCcy: inInvoice, methodCode: method.code, cashierId: actor.userId, note: raw.note?.trim() || null } });
    const paid = inv.amountPaid.add(inInvoice);
    await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: paid, status: statusFor(inv.total, paid) } });
    await refreshDebt(tx, invoiceId);
    await tx.ledgerEntry.create({ data: { type: "REVENUE", amount, currency: raw.currency, sourceType: "PAYMENT", sourceId: pay.id, description: `Encaissement ${pay.number} — facture ${inv.number}`, createdById: actor.userId } });
    await audit(actor, { action: "PAYMENT", module: "cash", entityType: "Payment", entityId: pay.id, details: { invoice: inv.number, amount: amount.toString(), currency: raw.currency } }, tx);
    return pay;
  });
  await receiptPdf(actor, p.id);
  return p;
}

/** Erreur d'encaissement : jamais de suppression, une extourne négative liée à l'original. */
export async function reversePayment(actor: Actor, paymentId: string, reason: string) {
  assertCan(actor, "finance", "validate");
  if (!reason?.trim()) throw new ValidationError("Le motif de l'extourne est obligatoire.", "reason");
  return db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { reversedBy: true, invoice: true } });
    if (!p || p.amount.lte(0)) throw new ValidationError("Paiement introuvable.");
    if (p.reversedBy) throw new ValidationError("Ce paiement a déjà été extourné.");
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${p.invoiceId} FOR UPDATE`;
    const y = new Date().getUTCFullYear();
    const rev = await tx.payment.create({ data: { number: `EXT-${y}-${String(await nextNumber(`EXT-${y}`, tx)).padStart(5, "0")}`, invoiceId: p.invoiceId, amount: p.amount.neg(), currency: p.currency, exchangeRate: p.exchangeRate, amountInInvoiceCcy: p.amountInInvoiceCcy.neg(), methodCode: p.methodCode, cashierId: actor.userId, reversalOfId: p.id, reversalReason: reason.trim() } });
    const paid = p.invoice.amountPaid.sub(p.amountInInvoiceCcy);
    await tx.invoice.update({ where: { id: p.invoiceId }, data: { amountPaid: paid, status: statusFor(p.invoice.total, paid) } });
    await refreshDebt(tx, p.invoiceId);
    const orig = await tx.ledgerEntry.findFirst({ where: { sourceType: "PAYMENT", sourceId: p.id } });
    await tx.ledgerEntry.create({ data: { type: "REVERSAL", amount: p.amount.neg(), currency: p.currency, sourceType: "PAYMENT_REVERSAL", sourceId: rev.id, description: `Extourne de ${p.number} : ${reason.trim()}`, createdById: actor.userId, reversesId: orig?.id } });
    await audit(actor, { action: "REVERSAL", module: "finance", entityType: "Payment", entityId: p.id, details: { reason, reversal: rev.number } }, tx);
    return rev;
  });
}

// ── Remises (demande puis validation par une personne autorisée) ──
export async function requestDiscount(actor: Actor, invoiceId: string, raw: { amount: string; reason: string }) {
  assertCan(actor, "billing", "update");
  const amount = parse(money.refine((v) => v.gt(0), "Le montant doit être positif."), raw.amount);
  if (!raw.reason?.trim()) throw new ValidationError("Le motif de la remise est obligatoire.", "reason");
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (amount.gt(inv.total.sub(inv.amountPaid))) throw new ValidationError("La remise dépasse le reste à payer.", "amount");
  const d = await db.discount.create({ data: { invoiceId, amount, reason: raw.reason.trim(), requestedById: actor.userId } });
  await audit(actor, { action: "DISCOUNT_REQUEST", module: "billing", entityType: "Discount", entityId: d.id, details: { invoice: inv.number, amount: amount.toString() } });
  await notifyPermission("billing", "validate", { module: "billing", type: "DISCOUNT", title: `Remise à valider (${inv.number})`, body: `${fmtMoney(amount, inv.currency)} — ${raw.reason.trim()}`, entityType: "Invoice", entityId: inv.id, link: `/caisse/factures/${inv.id}`, dedupeKey: `disc:${d.id}` }, db, actor.userId);
  return d;
}
export async function decideDiscount(actor: Actor, discountId: string, approve: boolean) {
  assertCan(actor, "billing", "validate");
  return db.$transaction(async (tx) => {
    const d = await tx.discount.findUniqueOrThrow({ where: { id: discountId }, include: { invoice: true } });
    if (d.status !== "PENDING") throw new ValidationError("Cette remise a déjà été traitée.");
    if (d.requestedById === actor.userId && !actor.isSuperAdmin) throw new ForbiddenError("Une remise ne peut pas être validée par la personne qui l'a demandée.");
    await tx.discount.update({ where: { id: discountId }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: new Date() } });
    if (approve) {
      const inv = d.invoice;
      if (d.amount.gt(inv.total.sub(inv.amountPaid))) throw new ValidationError("La remise dépasse désormais le reste à payer.");
      const total = inv.total.sub(d.amount);
      await tx.invoice.update({ where: { id: inv.id }, data: { discountTotal: inv.discountTotal.add(d.amount), total, status: statusFor(total, inv.amountPaid) } });
      await refreshDebt(tx, inv.id);
    }
    await audit(actor, { action: approve ? "DISCOUNT_APPROVE" : "DISCOUNT_REJECT", module: "billing", entityType: "Discount", entityId: discountId }, tx);
  });
}

/** Annulation d'une facture sans paiement : les prestations redeviennent facturables. */
export async function cancelInvoice(actor: Actor, invoiceId: string, reason: string) {
  assertCan(actor, "billing", "validate");
  if (!reason?.trim()) throw new ValidationError("Le motif est obligatoire.", "reason");
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (inv.amountPaid.gt(0)) throw new ValidationError("Des paiements existent : extournez-les d'abord.");
    if (inv.type !== "PATIENT") throw new ValidationError("Seule une facture patient peut être annulée ici.");
    await tx.charge.updateMany({ where: { invoiceId }, data: { invoiceId: null, amountInInvoiceCcy: null } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.userId, cancelReason: reason.trim() } });
    await audit(actor, { action: "CANCEL", module: "billing", entityType: "Invoice", entityId: invoiceId, details: { reason } }, tx);
  });
}

// ── Crédit : demandé par la caisse, décidé UNIQUEMENT par le Directeur général ──
export async function requestCredit(actor: Actor, invoiceId: string, reason: string) {
  assertCan(actor, "credit", "create");
  if (!reason?.trim()) throw new ValidationError("Expliquez pourquoi le patient ne peut pas payer.", "reason");
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { patient: true } });
  if (!inv?.patientId) throw new ValidationError("Facture introuvable.");
  const balance = inv.total.sub(inv.amountPaid);
  if (balance.lte(0) || inv.status === "CANCELLED") throw new ValidationError("Cette facture n'a pas de reste à payer.");
  if (await db.creditRequest.findFirst({ where: { invoiceId, status: { in: ["PENDING", "APPROVED"] } } })) throw new ValidationError("Une demande de crédit existe déjà pour cette facture.");
  const c = await db.creditRequest.create({ data: { invoiceId, patientId: inv.patientId, amount: balance, currency: inv.currency, reason: reason.trim(), requestedById: actor.userId } });
  await audit(actor, { action: "CREDIT_REQUEST", module: "credit", entityType: "CreditRequest", entityId: c.id, details: { invoice: inv.number, amount: balance.toString() } });
  await notifyPermission("credit", "validate", { module: "credit", type: "CREDIT_REQUEST", title: `Demande de crédit — ${displayName(inv.patient!)}`, body: `${fmtMoney(balance, inv.currency)} · facture ${inv.number}`, entityType: "CreditRequest", entityId: c.id, link: "/credits", dedupeKey: `credit:${c.id}` }, db, actor.userId);
  return c;
}

export async function decideCredit(actor: Actor, creditId: string, approve: boolean, note?: string) {
  assertCan(actor, "credit", "validate");
  const c = await db.$transaction(async (tx) => {
    const c = await tx.creditRequest.findUniqueOrThrow({ where: { id: creditId }, include: { invoice: true } });
    if (c.status !== "PENDING") throw new ValidationError("Cette demande a déjà été traitée.");
    await tx.creditRequest.update({ where: { id: creditId }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
    if (approve) {
      const balance = c.invoice.total.sub(c.invoice.amountPaid);
      await tx.debt.create({ data: { patientId: c.patientId, invoiceId: c.invoiceId, creditRequestId: c.id, originalAmount: balance, currency: c.invoice.currency, approvedById: actor.userId, status: c.invoice.amountPaid.gt(0) ? "PARTIALLY_PAID" : "OPEN" } });
    }
    await audit(actor, { action: approve ? "CREDIT_APPROVE" : "CREDIT_REJECT", module: "credit", entityType: "CreditRequest", entityId: creditId, details: { note: note ?? null } }, tx);
    return c;
  });
  await notify([c.requestedById], { module: "cash", type: "CREDIT_DECISION", title: approve ? "Crédit approuvé par le Directeur général" : "Crédit refusé par le Directeur général", entityType: "Invoice", entityId: c.invoiceId, link: `/caisse/factures/${c.invoiceId}`, dedupeKey: `credit:${c.id}:decision` });
}

export async function listCredits(actor: Actor, status?: "PENDING" | "APPROVED" | "REJECTED") {
  if (!can(actor, "credit", "view")) throw new ForbiddenError();
  return db.creditRequest.findMany({ where: status ? { status } : {}, orderBy: { requestedAt: "desc" }, take: 200, include: { patient: true, invoice: true } });
}

export async function listDebts(actor: Actor, open = true) {
  if (!can(actor, "finance", "view") && !can(actor, "credit", "view") && !can(actor, "cash", "view")) throw new ForbiddenError();
  return db.debt.findMany({ where: open ? { status: { not: "SETTLED" } } : {}, orderBy: { createdAt: "desc" }, include: { patient: true, invoice: { include: { payments: { orderBy: { receivedAt: "asc" } } } }, creditRequest: true } });
}

/** Dettes antérieures d'un patient (affichées à son retour aux personnes autorisées). */
export async function openDebtsOf(patientId: string) {
  const d = await db.debt.findMany({ where: { patientId, status: { not: "SETTLED" } }, include: { invoice: true } });
  return d.map((x) => ({ number: x.invoice.number, remaining: x.invoice.total.sub(x.invoice.amountPaid), currency: x.currency, invoiceId: x.invoiceId }));
}

export async function getInvoice(actor: Actor, id: string) {
  if (!["billing", "cash", "credit", "finance"].some((m) => can(actor, m as "billing", "view"))) throw new ForbiddenError();
  return db.invoice.findUnique({ where: { id }, include: { patient: true, sale: { include: { items: { include: { product: true } } } }, charges: { orderBy: { createdAt: "asc" }, include: { department: true } }, payments: { orderBy: { receivedAt: "asc" }, include: { reversedBy: true } }, discounts: true, creditRequests: true, debt: true } });
}

export async function listInvoices(actor: Actor, f: { status?: "open" | InvoiceStatus; q?: string }) {
  if (!can(actor, "billing", "view") && !can(actor, "cash", "view")) throw new ForbiddenError();
  return db.invoice.findMany({
    where: { ...(f.status === "open" ? { status: { in: ["ISSUED", "PARTIALLY_PAID"] } } : f.status ? { status: f.status } : {}),
      ...(f.q ? { OR: [{ number: { contains: f.q.toUpperCase() } }, { patient: { searchName: { contains: f.q.toLowerCase() } } }, { patient: { patientNumber: { contains: f.q.toUpperCase() } } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 200, include: { patient: true, sale: true, creditRequests: true },
  });
}

/** Patients avec des prestations non facturées (à facturer par la caisse). */
export async function patientsToInvoice(actor: Actor) {
  if (!canInvoice(actor)) return [];
  const g = await db.charge.groupBy({ by: ["patientId"], where: { status: "ACTIVE", invoiceId: null, patientId: { not: null } }, _count: { _all: true } });
  const ps = await db.patient.findMany({ where: { id: { in: g.map((x) => x.patientId!) } } });
  return ps.map((p) => ({ ...p, lines: g.find((x) => x.patientId === p.id)!._count._all }));
}

// ── Documents ──
export async function invoicePdf(actor: Actor, id: string) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: { patient: true, charges: { include: { department: true } }, sale: { include: { items: { include: { product: true } } } }, payments: true } });
  const number = await documentNumber("INVOICE");
  const pdf = await createPdf({ title: inv.type === "DIRECT_SALE" ? "Facture — vente pharmacie" : "Facture", reference: inv.number, date: inv.issuedAt ?? inv.createdAt }, (doc) => {
    pdfFields(doc, [["Patient / client", inv.patient ? displayName(inv.patient) : inv.sale?.customerName ?? "Client de passage"], ["N° de dossier", inv.patient?.patientNumber], ["Devise", inv.currency], ["Taux appliqué", inv.exchangeRate ? `1 USD = ${inv.exchangeRate} CDF` : null]]);
    section(doc, "Détail");
    const rows = inv.type === "DIRECT_SALE"
      ? inv.sale!.items.map((i) => [i.product.name, "Pharmacie", String(i.quantity), fmtMoney(i.unitPrice, inv.currency), fmtMoney(i.total, inv.currency)])
      : inv.charges.map((c) => [c.description, c.department?.name ?? "", c.quantity.toString(), fmtMoney(c.unitPrice, c.currency), fmtMoney(c.amountInInvoiceCcy ?? c.total, inv.currency)]);
    table(doc, ["Description", "Service", "Qté", "Prix unitaire", "Sous-total"], [170, 90, 40, 95, 100], rows, ["left", "left", "right", "right", "right"]);
    table(doc, ["", ""], [395, 100], [["Sous-total", fmtMoney(inv.subtotal, inv.currency)], ...(inv.discountTotal.gt(0) ? [["Remise", `− ${fmtMoney(inv.discountTotal, inv.currency)}`]] : []), ["TOTAL", fmtMoney(inv.total, inv.currency)], ["Déjà payé", fmtMoney(inv.amountPaid, inv.currency)], ["Reste à payer", fmtMoney(inv.total.sub(inv.amountPaid), inv.currency)]], ["right", "right"]);
    paragraph(doc, "Cette facture n'est pas un reçu : seul le reçu remis par la caisse atteste un paiement.");
  });
  return storeDocument({ type: "INVOICE", title: `Facture ${inv.number}`, pdf, number, createdById: actor.userId, patientId: inv.patientId, entityType: "Invoice", entityId: inv.id, visibleToPatient: !!inv.patientId });
}

export async function receiptPdf(actor: Actor, paymentId: string) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: { include: { patient: true, sale: true } }, method: true } });
  const cashier = await db.user.findUnique({ where: { id: p.cashierId }, include: { employee: true } });
  const number = await documentNumber("RECEIPT");
  const pdf = await createPdf({ title: "Reçu de paiement", reference: p.number, date: p.receivedAt }, (doc) => {
    const inv = p.invoice;
    pdfFields(doc, [["Reçu de", inv.patient ? displayName(inv.patient) : inv.sale?.customerName ?? "Client de passage"], ["N° de dossier", inv.patient?.patientNumber],
      ["Facture", inv.number], ["Mode de paiement", p.method.name], ["Montant reçu", fmtMoney(p.amount, p.currency)], ["Équivalent facture", p.currency !== inv.currency ? fmtMoney(p.amountInInvoiceCcy, inv.currency) : null],
      ["Total de la facture", fmtMoney(inv.total, inv.currency)], ["Reste à payer", fmtMoney(inv.total.sub(inv.amountPaid), inv.currency)]]);
    signature(doc, "Caissier", cashier?.employee ? `${cashier.employee.firstName} ${cashier.employee.lastName.toUpperCase()}` : cashier?.username);
  });
  return storeDocument({ type: "RECEIPT", title: `Reçu ${p.number}`, pdf, number, createdById: actor.userId, patientId: p.invoice.patientId, entityType: "Payment", entityId: p.id, visibleToPatient: !!p.invoice.patientId });
}
