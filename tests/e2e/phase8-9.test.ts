// Phases 8 et 9 — laboratoire (scénario B) et pharmacie (scénario D).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { writeFileSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";
import { BASE, axeViolations, overflowPx, startServer, stopServer } from "./lib/server";
import { account, openAs, type Acc } from "./lib/accounts";
import { db } from "../../src/server/db";

const SHOTS = process.env.E2E_SHOTS ?? "test-results";
const tag = `p89${Date.now().toString(36)}`;
let server: ChildProcess, browser: Browser;
const errors: string[] = [];
let doc: Acc, labm: Acc, pharm: Acc, nurse: Acc;
let patientId = "";
const LAST = `MUMBERE${tag}`.toUpperCase();

before(async () => {
  [doc, labm, pharm, nurse] = [await account(tag, "MEDECIN", "Moise", "Doc"), await account(tag, "RESP_LABORATOIRE", "Neema", "Labo"), await account(tag, "RESP_PHARMACIE", "Furaha", "Pharma"), await account(tag, "INFIRMIER", "Zawadi", "Inf")];
  const spec = await db.specialty.create({ data: { code: `G-${tag}`, name: `Générale ${tag}` } });
  await db.doctorAssignment.create({ data: { employeeId: doc.empId, specialtyId: spec.id } });
  patientId = (await db.patient.create({ data: { patientNumber: `P-${tag}`, lastName: LAST, firstName: "Eric", searchName: `${LAST.toLowerCase()} eric` } })).id;
  await db.visit.create({ data: { patientId, status: "ORIENTED", orientedToDoctorId: doc.empId, reason: "Fièvre" } });
  const t = await db.tariffItem.create({ data: { code: `GE-${tag}`, name: "Goutte épaisse", category: "LAB", price: "3.00", currency: "USD" } });
  await db.labTest.create({ data: { code: `GE${tag}`.toUpperCase().slice(0, 20), name: `Goutte épaisse ${tag}`, category: "Parasitologie", sampleType: "Sang", tariffItemId: t.id } });
  server = await startServer(); browser = await chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); await db.$disconnect(); });

test("Scénario B — demande de laboratoire", async (t) => {
  const d = await openAs(browser, errors, doc.username);
  let consultUrl = "";
  await t.test("le médecin demande une analyse depuis la consultation", async () => {
    await d.goto(`${BASE}/medecin`);
    await d.getByRole("button", { name: `Recevoir ${LAST} Eric` }).click();
    await d.waitForURL(/consultations/); consultUrl = d.url();
    await d.getByLabel(new RegExp(`Goutte épaisse ${tag}`)).check();
    await d.getByLabel("Renseignements cliniques").fill("Fièvre depuis 3 jours");
    await d.getByRole("button", { name: "Envoyer au laboratoire" }).click();
    await d.getByRole("status").filter({ hasText: /Demande LAB-\d{4}-\d{5} envoyée/ }).waitFor();
    await d.getByText("Nouvelle demande").waitFor();
  });
  const l = await openAs(browser, errors, labm.username, undefined, { width: 820, height: 1180 });
  await t.test("le laboratoire reçoit, prélève, saisit et soumet", async () => {
    assert.ok(await db.notification.findFirst({ where: { recipientUserId: labm.userId, type: "LAB_REQUEST" } }), "notification reçue");
    await l.goto(`${BASE}/laboratoire`);
    await l.getByRole("link", { name: new RegExp(LAST) }).click();
    await l.getByRole("button", { name: "Enregistrer le prélèvement" }).click();
    await l.getByRole("status").filter({ hasText: "Prélèvement enregistré." }).waitFor();
    await l.getByLabel("Résultat").fill("Positif (++)");
    await l.getByLabel("Interprétation").selectOption("anormal");
    await l.getByLabel("Conclusion").fill("Paludisme à P. falciparum");
    await l.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await l.getByRole("status").filter({ hasText: "Résultats enregistrés." }).waitFor();
    await l.waitForTimeout(300);
    assert.equal(await l.getByLabel("Interprétation").inputValue(), "anormal", "valeur conservée après enregistrement");
    await l.getByRole("button", { name: "Soumettre pour validation" }).click();
    await l.getByRole("status").filter({ hasText: "Résultats soumis pour validation." }).waitFor();
    assert.deepEqual(await axeViolations(l), []);
  });
  await t.test("le responsable valide : PDF et médecin notifié", async () => {
    await l.getByRole("button", { name: "Valider les résultats" }).click();
    await l.getByRole("dialog", { name: "Valider ces résultats ?" }).getByRole("button", { name: "Valider" }).click();
    await l.getByRole("status").filter({ hasText: /Résultats validés/ }).waitFor();
    const href = await l.getByRole("link", { name: "Résultats en PDF" }).getAttribute("href");
    const res = await l.request.get(`${BASE}${href}`);
    assert.equal(res.status(), 200); assert.equal(res.headers()["content-type"], "application/pdf");
    assert.ok(await db.notification.findFirst({ where: { recipientUserId: doc.userId, type: "LAB_RESULT" } }));
    await l.screenshot({ path: path.join(SHOTS, "p8-tablette-resultats.png"), fullPage: true });
  });
  await t.test("le résultat apparaît dans la consultation et dans le dossier", async () => {
    await d.goto(consultUrl);
    await d.getByRole("link", { name: "Voir les résultats" }).click();
    await d.getByText("Positif (++)").waitFor();
    await d.goto(`${BASE}/patients/${patientId}`);
    await d.getByRole("tab", { name: /Examens/ }).click();
    await d.getByText(/Positif \(\+\+\)/).waitFor();
    const ch = await db.charge.findFirstOrThrow({ where: { patientId, source: "LAB" } });
    assert.equal(ch.total.toString(), "3");
  });
});

test("Scénario D — pharmacie : vente directe et consommation patient", async (t) => {
  const p = await openAs(browser, errors, pharm.username);
  const PRODUCT = `Seringue 5 ml ${tag}`;
  await t.test("création d'un produit avec photo et entrée en stock", async () => {
    const png = path.join(SHOTS, "produit.png");
    writeFileSync(png, Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex"));
    await p.goto(`${BASE}/pharmacie/produits/nouveau`);
    await p.getByLabel("Nom *").fill(PRODUCT);
    await p.getByLabel("Prix *").fill("0,50");
    await p.getByLabel("Seuil d'alerte *").fill("3");
    await p.getByLabel("Photo").setInputFiles(png);
    await p.getByRole("button", { name: "Créer le produit" }).click();
    await p.waitForURL(/produits\/c.*cree=1/);
    await p.getByRole("button", { name: "Entrée en stock" }).click();
    await p.getByRole("dialog").getByLabel("Quantité reçue *").fill("10");
    await p.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
    await p.getByRole("status").filter({ hasText: "Entrée en stock enregistrée." }).waitFor();
    await p.getByText("10 unité").first().waitFor();
  });
  await t.test("boutique : panier et vente, facture transmise à la caisse", async () => {
    await p.goto(`${BASE}/pharmacie`);
    await p.getByRole("button", { name: `Ajouter ${PRODUCT} au panier` }).click();
    await p.getByRole("button", { name: `Ajouter un ${PRODUCT}` }).click();
    await p.getByRole("button", { name: "Enregistrer la vente" }).click();
    await p.getByRole("status").filter({ hasText: /Vente enregistrée — facture FAC-\d{4}-\d{5}/ }).waitFor();
    const prod = await db.product.findFirstOrThrow({ where: { name: PRODUCT } });
    assert.equal(prod.quantityOnHand, 8);
    const inv = await db.invoice.findFirstOrThrow({ where: { type: "DIRECT_SALE", sale: { items: { some: { productId: prod.id } } } } });
    assert.equal(inv.status, "ISSUED"); assert.equal(inv.total.toString(), "1");
    assert.deepEqual(await axeViolations(p), []);
  });
  await t.test("infirmier : consommation pour un patient présent, ajoutée à son compte", async () => {
    const n = await openAs(browser, errors, nurse.username, undefined, { width: 390, height: 844 });
    await n.goto(`${BASE}/pharmacie`);
    await n.getByRole("tab", { name: "Consommation patient" }).click();
    await n.getByLabel("Patient *").selectOption({ label: `${LAST} Eric — P-${tag}` });
    await n.getByLabel("Produit *").selectOption({ label: `${PRODUCT} (8 en stock)` });
    await n.getByLabel("Quantité *").fill("6");
    await n.getByRole("button", { name: "Enregistrer la sortie" }).click();
    await n.getByRole("status").filter({ hasText: "Sortie enregistrée et ajoutée au compte du patient." }).waitFor();
    assert.ok(await overflowPx(n) <= 0);
    await n.screenshot({ path: path.join(SHOTS, "p9-telephone-consommation.png"), fullPage: true });
    const prod = await db.product.findFirstOrThrow({ where: { name: PRODUCT } });
    assert.equal(prod.quantityOnHand, 2);
    const ch = await db.charge.findFirstOrThrow({ where: { patientId, productId: prod.id } });
    assert.equal(ch.total.toString(), "3"); assert.equal(ch.invoiceId, null);
    assert.ok(await db.notification.findFirst({ where: { recipientUserId: pharm.userId, type: "LOW_STOCK", entityId: prod.id } }), "alerte de stock bas");
  });
  await t.test("historique complet du produit", async () => {
    await p.goto(`${BASE}/pharmacie`);
    await p.getByRole("tab", { name: /Stock/ }).click();
    await p.getByRole("link", { name: PRODUCT }).click();
    for (const txt of ["Entrée", "Vente", `Consommation patient — ${LAST} Eric`]) await p.getByText(txt, { exact: false }).first().waitFor();
    await p.getByText("Stock bas").or(p.getByText("2 unité")).first().waitFor();
  });
  await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
});
