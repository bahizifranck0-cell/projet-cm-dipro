import { z } from "zod";
import { Prisma, type Currency } from "@prisma/client";
import { db, type Tx } from "../db";
import { assertCan, can, ForbiddenError, ValidationError, type Actor } from "../auth/actor";
import { savePhoto } from "../storage";
import { audit } from "./audit";
import { notifyPermission } from "./notifications";
import { nextNumber } from "./sequences";
import { opt, parse, req } from "./validation";

const money = z.string().trim().regex(/^\d+([.,]\d{1,2})?$/, "Prix invalide (ex. 2.50).").transform((v) => v.replace(",", "."));
const productInput = z.object({
  name: req("Le nom", 120), description: opt(1000), unit: opt(30), price: money, currency: z.enum(["USD", "CDF"]),
  minStockLevel: z.coerce.number().int().min(0, "Le seuil ne peut pas être négatif.").max(1_000_000), shopVisible: z.coerce.boolean().default(true),
});

export async function listProducts(actor: Actor, opts: { q?: string; shop?: boolean; low?: boolean } = {}) {
  if (!can(actor, "pharmacy", "view") && !can(actor, "hospitalization", "update")) throw new ForbiddenError();
  const rows = await db.product.findMany({
    where: { active: true, ...(opts.shop ? { shopVisible: true } : {}), ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { sku: { contains: opts.q.toUpperCase() } }] } : {}) },
    orderBy: { name: "asc" }, take: 500,
  });
  return opts.low ? rows.filter((p) => p.quantityOnHand <= p.minStockLevel) : rows;
}

export async function createProduct(actor: Actor, raw: unknown, photo?: Buffer) {
  assertCan(actor, "pharmacy", "create");
  const d = parse(productInput, raw);
  const sku = `PRD-${String(await nextNumber("PRD")).padStart(5, "0")}`;
  const p = await db.product.create({ data: { ...d, unit: d.unit ?? "unité", sku } });
  if (photo?.length) await db.product.update({ where: { id: p.id }, data: { photoPath: await savePhoto(`products/${p.id}`, photo) } });
  await audit(actor, { action: "CREATE", module: "pharmacy", entityType: "Product", entityId: p.id, details: { sku, name: d.name, price: d.price, currency: d.currency } });
  return p;
}

export async function updateProduct(actor: Actor, id: string, raw: unknown, photo?: Buffer) {
  assertCan(actor, "pharmacy", "update");
  const d = parse(productInput, raw);
  const before = await db.product.findUniqueOrThrow({ where: { id } });
  const p = await db.product.update({ where: { id }, data: { ...d, unit: d.unit ?? "unité", description: d.description ?? null, ...(photo?.length ? { photoPath: await savePhoto(`products/${id}`, photo) } : {}) } });
  await audit(actor, { action: "UPDATE", module: "pharmacy", entityType: "Product", entityId: id, details: { price: { before: before.price.toString(), after: d.price }, currency: d.currency, minStockLevel: d.minStockLevel } });
  return p;
}

export async function setProductActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "pharmacy", "delete");
  await db.product.update({ where: { id }, data: { active } });
  await audit(actor, { action: active ? "ACTIVATE" : "DEACTIVATE", module: "pharmacy", entityType: "Product", entityId: id });
}

/** Mouvement atomique : le stock ne peut jamais passer sous zéro, même avec deux postes simultanés. */
async function move(tx: Tx, input: { productId: string; delta: number; type: "ENTRY" | "SALE" | "PATIENT_CONSUMPTION" | "ADJUSTMENT" | "REVERSAL"; reason?: string | null; userId: string; patientId?: string | null; saleId?: string; chargeId?: string; departmentId?: string | null; reversesId?: string }) {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new ValidationError("Quantité invalide.", "quantity");
  const rows = await tx.$queryRaw<{ quantityOnHand: number; name: string; minStockLevel: number }[]>`
    UPDATE "Product" SET "quantityOnHand" = "quantityOnHand" + ${input.delta}, "updatedAt" = now()
    WHERE id = ${input.productId} AND active AND "quantityOnHand" + ${input.delta} >= 0
    RETURNING "quantityOnHand", name, "minStockLevel"`;
  if (!rows.length) {
    const p = await tx.product.findUnique({ where: { id: input.productId } });
    if (!p || !p.active) throw new ValidationError("Produit introuvable ou retiré.");
    throw new ValidationError(`Stock insuffisant pour « ${p.name} » : ${p.quantityOnHand} disponible(s).`, "quantity");
  }
  const m = await tx.stockMovement.create({ data: {
    productId: input.productId, type: input.type, quantity: input.delta, balanceAfter: rows[0].quantityOnHand, reason: input.reason ?? null,
    userId: input.userId, patientId: input.patientId ?? null, saleId: input.saleId, chargeId: input.chargeId, departmentId: input.departmentId ?? null, reversesId: input.reversesId,
  } });
  return { movement: m, ...rows[0] };
}

async function lowStockAlert(tx: Tx, productId: string, r: { quantityOnHand: number; name: string; minStockLevel: number }, actorId: string) {
  if (r.quantityOnHand > r.minStockLevel) return;
  const entries = await tx.stockMovement.count({ where: { productId, type: "ENTRY" } }); // une alerte par cycle de réapprovisionnement
  await notifyPermission("pharmacy", "update", {
    module: "pharmacy", type: "LOW_STOCK", title: `Stock bas : ${r.name}`, body: `${r.quantityOnHand} restant(s) — seuil ${r.minStockLevel}`,
    entityType: "Product", entityId: productId, link: `/pharmacie/produits/${productId}`, dedupeKey: `stock-low:${productId}:${entries}`,
  }, tx, undefined);
  void actorId;
}

const qty = z.coerce.number().int("Quantité entière attendue.").positive("La quantité doit être positive.");

export async function stockEntry(actor: Actor, productId: string, quantity: unknown, reason?: string) {
  assertCan(actor, "pharmacy", "update");
  const q = parse(qty, quantity);
  await db.$transaction(async (tx) => {
    const r = await move(tx, { productId, delta: q, type: "ENTRY", reason: reason?.trim() || "Entrée en stock", userId: actor.userId });
    await audit(actor, { action: "STOCK_ENTRY", module: "pharmacy", entityType: "Product", entityId: productId, details: { quantity: q, balance: r.quantityOnHand } }, tx);
  });
}

/** Correction d'inventaire : motif obligatoire, auteur et date conservés. */
export async function adjustStock(actor: Actor, productId: string, delta: unknown, reason: string) {
  assertCan(actor, "pharmacy", "update");
  const d = parse(z.coerce.number().int("Quantité entière attendue.").refine((v) => v !== 0, "La correction ne peut pas être nulle."), delta);
  if (!reason?.trim()) throw new ValidationError("Le motif de la correction est obligatoire.", "reason");
  await db.$transaction(async (tx) => {
    const r = await move(tx, { productId, delta: d, type: "ADJUSTMENT", reason: reason.trim(), userId: actor.userId });
    if (d < 0) await lowStockAlert(tx, productId, r, actor.userId);
    await audit(actor, { action: "STOCK_ADJUST", module: "pharmacy", entityType: "Product", entityId: productId, details: { delta: d, reason } }, tx);
  });
}

/** Cas 1 — vente directe : stock diminué, facture émise ; le paiement est enregistré à la caisse quand il est reçu. */
export async function directSale(actor: Actor, itemsRaw: unknown, customerName?: string, patientId?: string) {
  assertCan(actor, "pharmacy", "create");
  const items = parse(z.array(z.object({ productId: z.string(), quantity: qty })).min(1, "Le panier est vide."), itemsRaw);
  const products = await db.product.findMany({ where: { id: { in: items.map((i) => i.productId) }, active: true } });
  if (products.length !== new Set(items.map((i) => i.productId)).size) throw new ValidationError("Un produit du panier n'est plus disponible.");
  const currencies = new Set(products.map((p) => p.currency));
  if (currencies.size > 1) throw new ValidationError("Le panier mélange USD et CDF : faites une vente par devise.");
  const currency = [...currencies][0] as Currency;
  const y = new Date().getUTCFullYear();
  return db.$transaction(async (tx) => {
    const lines = items.map((i) => { const p = products.find((x) => x.id === i.productId)!; return { ...i, product: p, total: p.price.mul(i.quantity) }; });
    const total = lines.reduce((s, l) => s.add(l.total), new Prisma.Decimal(0));
    const sale = await tx.sale.create({ data: {
      number: `VTE-${y}-${String(await nextNumber(`VTE-${y}`, tx)).padStart(5, "0")}`, sellerId: actor.userId, customerName: customerName?.trim() || null, patientId: patientId || null, currency, total,
      items: { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.product.price, total: l.total })) },
    } });
    for (const l of lines) {
      const r = await move(tx, { productId: l.productId, delta: -l.quantity, type: "SALE", userId: actor.userId, saleId: sale.id, patientId: patientId || null });
      await lowStockAlert(tx, l.productId, r, actor.userId);
    }
    const invoice = await tx.invoice.create({ data: {
      number: `FAC-${y}-${String(await nextNumber(`FAC-${y}`, tx)).padStart(5, "0")}`, type: "DIRECT_SALE", saleId: sale.id, patientId: patientId || null,
      currency, subtotal: total, total, status: "ISSUED", issuedAt: new Date(), issuedById: actor.userId,
    } });
    await audit(actor, { action: "SALE", module: "pharmacy", entityType: "Sale", entityId: sale.id, details: { total: total.toString(), currency, invoice: invoice.number } }, tx);
    return { sale, invoice };
  });
}

/**
 * Cas 2 — consommation pendant les soins : sortie de stock + montant ajouté au compte du patient
 * (facturé avec ses autres prestations, ce n'est PAS une vente déjà payée).
 */
export async function consumeForPatient(actor: Actor, raw: { patientId: string; productId: string; quantity: unknown; departmentId?: string; reason?: string }) {
  if (!can(actor, "pharmacy", "create") && !can(actor, "hospitalization", "update")) throw new ForbiddenError();
  const q = parse(qty, raw.quantity);
  const patient = await db.patient.findUnique({ where: { id: raw.patientId } });
  if (!patient) throw new ValidationError("Patient introuvable.", "patientId");
  const product = await db.product.findUnique({ where: { id: raw.productId } });
  if (!product?.active) throw new ValidationError("Produit introuvable.", "productId");
  const [visit, admission] = await Promise.all([
    db.visit.findFirst({ where: { patientId: patient.id, status: { in: ["WAITING", "ORIENTED", "IN_CONSULTATION", "ADMITTED"] } } }),
    db.admission.findFirst({ where: { patientId: patient.id, status: "ACTIVE" } }),
  ]);
  return db.$transaction(async (tx) => {
    const total = product.price.mul(q);
    const charge = await tx.charge.create({ data: {
      patientId: patient.id, visitId: visit?.id ?? admission?.visitId ?? null, admissionId: admission?.id ?? null, source: "PRODUCT", sourceId: product.id, productId: product.id,
      departmentId: raw.departmentId || null, description: product.name, quantity: q, unitPrice: product.price, currency: product.currency, total, createdById: actor.userId,
    } });
    const r = await move(tx, { productId: product.id, delta: -q, type: "PATIENT_CONSUMPTION", reason: raw.reason?.trim() || null, userId: actor.userId, patientId: patient.id, chargeId: charge.id, departmentId: raw.departmentId || null });
    await lowStockAlert(tx, product.id, r, actor.userId);
    await audit(actor, { action: "CONSUME", module: "pharmacy", entityType: "StockMovement", entityId: r.movement.id, details: { patientId: patient.id, product: product.name, quantity: q, total: total.toString() } }, tx);
    return { movement: r.movement, charge };
  });
}

/** Annulation d'une consommation saisie par erreur : extourne de stock + prestation annulée (si pas encore facturée). */
export async function reverseConsumption(actor: Actor, movementId: string, reason: string) {
  assertCan(actor, "pharmacy", "update");
  if (!reason?.trim()) throw new ValidationError("Le motif est obligatoire.", "reason");
  const m = await db.stockMovement.findUnique({ where: { id: movementId }, include: { charge: true, reversedBy: true } });
  if (!m || m.type !== "PATIENT_CONSUMPTION") throw new ValidationError("Mouvement introuvable.");
  if (m.reversedBy) throw new ValidationError("Ce mouvement a déjà été annulé.");
  if (m.charge?.invoiceId) throw new ValidationError("Déjà facturé : la correction doit passer par la facturation.");
  await db.$transaction(async (tx) => {
    await move(tx, { productId: m.productId, delta: -m.quantity, type: "REVERSAL", reason: reason.trim(), userId: actor.userId, patientId: m.patientId, reversesId: m.id });
    if (m.chargeId) await tx.charge.update({ where: { id: m.chargeId }, data: { status: "CANCELLED", cancelledById: actor.userId, cancelledAt: new Date(), cancelReason: reason.trim() } });
    await audit(actor, { action: "REVERSAL", module: "pharmacy", entityType: "StockMovement", entityId: movementId, details: { reason } }, tx);
  });
}

export async function productDetail(actor: Actor, id: string) {
  assertCan(actor, "pharmacy", "view");
  const p = await db.product.findUnique({ where: { id }, include: { movements: { orderBy: { at: "desc" }, take: 100, include: { patient: true, reversedBy: true } } } });
  if (!p) return null;
  const users = await db.user.findMany({ where: { id: { in: [...new Set(p.movements.map((m) => m.userId))] } }, select: { id: true, username: true } });
  return { ...p, userName: Object.fromEntries(users.map((u) => [u.id, u.username])) };
}

export async function pharmacyStats() {
  const [products, low, today] = await Promise.all([
    db.product.count({ where: { active: true } }),
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "Product" WHERE active AND "quantityOnHand" <= "minStockLevel"`,
    db.stockMovement.groupBy({ by: ["type"], where: { at: { gte: new Date(Date.now() - 86400e3) } }, _count: { _all: true } }),
  ]);
  return { products, low: Number(low[0].n), last24h: Object.fromEntries(today.map((t) => [t.type, t._count._all])) };
}
