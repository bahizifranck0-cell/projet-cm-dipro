import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError } from "../../src/server/auth/actor";
import * as ph from "../../src/server/services/pharmacy";
import { listNotifications } from "../../src/server/services/notifications";
import { actorWithRole, freshSeed } from "../helpers";

type A = Awaited<ReturnType<typeof actorWithRole>>;
let pharm: A, nurse: A, cashier: A, hosp: A;
let syringe = "", para = "", patientId = "";
before(async () => {
  await freshSeed();
  [pharm, nurse, cashier, hosp] = await Promise.all([actorWithRole("RESP_PHARMACIE"), actorWithRole("INFIRMIER"), actorWithRole("CAISSIER"), actorWithRole("RESP_URGENCES_HOSPITALISATION")]);
  patientId = (await db.patient.create({ data: { patientNumber: `P9-${Date.now()}`, lastName: "Kasereka", firstName: "Luc", searchName: "kasereka luc" } })).id;
  await db.visit.create({ data: { patientId, status: "ORIENTED" } });
});
after(() => db.$disconnect());

test("produits : création réservée à la pharmacie, prix contrôlé", async () => {
  await assert.rejects(ph.createProduct(nurse.actor, { name: "X", price: "1", currency: "USD", minStockLevel: 1 }), ForbiddenError);
  await assert.rejects(ph.createProduct(pharm.actor, { name: "X", price: "-1", currency: "USD", minStockLevel: 1 }), /Prix invalide/);
  syringe = (await ph.createProduct(pharm.actor, { name: "Seringue 5 ml", price: "0.50", currency: "USD", minStockLevel: 5 })).id;
  para = (await ph.createProduct(pharm.actor, { name: "Paracétamol 500 mg (boîte)", price: "2,00", currency: "USD", minStockLevel: 2 })).id;
  await ph.stockEntry(pharm.actor, syringe, "20", "Livraison");
  await ph.stockEntry(pharm.actor, para, 10);
  await assert.rejects(ph.stockEntry(pharm.actor, para, "1.5"), /entière/);
});

test("vente directe : stock diminué immédiatement, facture émise mais NON payée", async () => {
  const { sale, invoice } = await ph.directSale(pharm.actor, [{ productId: para, quantity: 3 }], "Client de passage");
  assert.equal(sale.total.toString(), "6");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: para } })).quantityOnHand, 7);
  assert.equal(invoice.status, "ISSUED"); assert.equal(invoice.amountPaid.toString(), "0");
  assert.equal(await db.payment.count({ where: { invoiceId: invoice.id } }), 0, "facture ≠ paiement");
  await assert.rejects(ph.directSale(pharm.actor, [{ productId: para, quantity: 99 }]), /Stock insuffisant/);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: para } })).quantityOnHand, 7, "vente refusée : rien ne bouge");
  await assert.rejects(ph.directSale(cashier.actor, [{ productId: para, quantity: 1 }]), ForbiddenError);
});

test("consommation patient par un infirmier : stock + compte du patient, pas une vente", async () => {
  await assert.rejects(ph.consumeForPatient(cashier.actor, { patientId, productId: syringe, quantity: 1 }), ForbiddenError);
  const { movement, charge } = await ph.consumeForPatient(nurse.actor, { patientId, productId: syringe, quantity: 2 });
  assert.equal(movement.type, "PATIENT_CONSUMPTION"); assert.equal(movement.balanceAfter, 18);
  assert.equal(charge.total.toString(), "1"); assert.equal(charge.patientId, patientId); assert.equal(charge.invoiceId, null);
  assert.ok(charge.visitId, "rattaché au passage en cours");
  assert.equal(movement.chargeId, charge.id);
  assert.equal(await db.sale.count({ where: { patientId } }), 0);
});

test("stock concurrent : deux sorties simultanées ne passent jamais sous zéro", async () => {
  const p = await ph.createProduct(pharm.actor, { name: "Gants (paire)", price: "0.20", currency: "USD", minStockLevel: 0 });
  await ph.stockEntry(pharm.actor, p.id, 5);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => ph.consumeForPatient(hosp.actor, { patientId, productId: p.id, quantity: 1 })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).quantityOnHand, 0);
  assert.equal(await db.charge.count({ where: { productId: p.id, status: "ACTIVE" } }), 5, "pas de prestation sans sortie de stock");
});

test("alerte de stock bas : une seule notification par cycle, à la pharmacie seulement", async () => {
  await ph.consumeForPatient(hosp.actor, { patientId, productId: syringe, quantity: 13 }); // 18 → 5 = seuil
  await ph.consumeForPatient(hosp.actor, { patientId, productId: syringe, quantity: 1 });  // 4
  const n = (await listNotifications(pharm.actor)).filter((x) => x.type === "LOW_STOCK" && x.entityId === syringe);
  assert.equal(n.length, 1, "pas de doublon");
  assert.equal((await listNotifications(nurse.actor)).filter((x) => x.type === "LOW_STOCK").length, 0);
  await ph.stockEntry(pharm.actor, syringe, 1);
  await ph.consumeForPatient(hosp.actor, { patientId, productId: syringe, quantity: 1 });
  assert.equal((await listNotifications(pharm.actor)).filter((x) => x.type === "LOW_STOCK" && x.entityId === syringe).length, 2, "nouvelle alerte après réapprovisionnement");
});

test("correction et annulation tracées ; facturé = plus d'annulation directe", async () => {
  await assert.rejects(ph.adjustStock(pharm.actor, para, -1, ""), /motif/);
  await ph.adjustStock(pharm.actor, para, -1, "Boîte abîmée");
  const m = (await db.stockMovement.findFirstOrThrow({ where: { productId: syringe, type: "PATIENT_CONSUMPTION" }, orderBy: { at: "asc" } }));
  await ph.reverseConsumption(pharm.actor, m.id, "Erreur de saisie");
  await assert.rejects(ph.reverseConsumption(pharm.actor, m.id, "encore"), /déjà été annulé/);
  assert.equal((await db.charge.findUniqueOrThrow({ where: { id: m.chargeId! } })).status, "CANCELLED");
  await assert.rejects(db.stockMovement.delete({ where: { id: m.id } }), /CMDPRO_IMMUTABLE/);
  const all = await db.stockMovement.findMany({ where: { productId: para } });
  assert.ok(all.every((x) => x.userId && x.at), "auteur et date toujours présents");
});
