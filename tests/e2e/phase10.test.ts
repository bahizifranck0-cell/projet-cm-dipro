// Phase 10 — scénarios A (paiement) et E (crédit validé par le DG, dette, remboursement).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";
import { BASE, axeViolations, overflowPx, startServer, stopServer } from "./lib/server";
import { account, openAs, type Acc } from "./lib/accounts";
import { db } from "../../src/server/db";

const SHOTS = process.env.E2E_SHOTS ?? "test-results";
const tag = `p10${Date.now().toString(36)}`;
let server: ChildProcess, browser: Browser;
const errors: string[] = [];
let doc: Acc, cashier: Acc, dg: Acc;
let patientId = "";
const LAST = `KAHAMBU${tag}`.toUpperCase();

before(async () => {
  [doc, cashier, dg] = [await account(tag, "MEDECIN", "Moise", "Doc"), await account(tag, "CAISSIER", "Imani", "Caisse"), await account(tag, "DIRECTEUR_GENERAL", "Jean", "Directeur")];
  const spec = await db.specialty.create({ data: { code: `G-${tag}`, name: `Générale ${tag}` } });
  await db.doctorAssignment.create({ data: { employeeId: doc.empId, specialtyId: spec.id } });
  await db.tariffItem.create({ data: { code: `CONS-${tag}`, name: "Consultation générale", category: "CONSULTATION", specialtyId: spec.id, price: "5.00", currency: "USD" } });
  patientId = (await db.patient.create({ data: { patientNumber: `P-${tag}`, lastName: LAST, firstName: "Ruth", searchName: `${LAST.toLowerCase()} ruth` } })).id;
  await db.visit.create({ data: { patientId, status: "ORIENTED", orientedToDoctorId: doc.empId } });
  server = await startServer(); browser = await chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); await db.$disconnect(); });

test("Scénarios A et E — facture, paiement partiel, crédit du DG, dette remboursée", async (t) => {
  await t.test("consultation signée : tarif appliqué automatiquement", async () => {
    const d = await openAs(browser, errors, doc.username);
    await d.goto(`${BASE}/medecin`);
    await d.getByRole("button", { name: `Recevoir ${LAST} Ruth` }).click();
    await d.waitForURL(/consultations/);
    await d.getByRole("textbox", { name: "Diagnostic" }).fill("Grippe");
    await d.getByRole("button", { name: "Signer la consultation" }).click();
    await d.getByRole("dialog").getByRole("button", { name: "Signer" }).click();
    await d.getByRole("status").filter({ hasText: "Consultation signée et ajoutée au compte du patient." }).waitFor();
  });
  const c = await openAs(browser, errors, cashier.username);
  let invoiceUrl = "";
  await t.test("caisse : facture établie (non payée), puis paiement partiel avec reçu", async () => {
    await c.goto(`${BASE}/caisse?vue=factures`);
    const row = c.getByRole("listitem").filter({ hasText: LAST });
    await row.getByRole("button", { name: "Établir la facture" }).click();
    await c.waitForURL(/caisse\/factures\/c.*creee=1/); invoiceUrl = c.url().split("?")[0];
    await c.getByText("Elle n'est pas encore payée").waitFor();
    await c.getByText("Reste à payer", { exact: true }).waitFor();
    await c.getByLabel("Montant reçu *").fill("2");
    await c.getByRole("button", { name: "Enregistrer le paiement" }).click();
    await c.getByRole("status").filter({ hasText: /Paiement enregistré — reçu REC-/ }).waitFor();
    await c.getByText("Payée en partie").waitFor();
    const href = await c.getByRole("link", { name: "Reçu PDF" }).getAttribute("href");
    const res = await c.request.get(`${BASE}${href}`);
    assert.equal(res.status(), 200); assert.equal(res.headers()["content-type"], "application/pdf");
    assert.deepEqual(await axeViolations(c), []);
  });
  await t.test("le patient ne peut pas payer : demande de crédit au DG", async () => {
    await c.getByRole("button", { name: "Demander un crédit au DG" }).click();
    await c.getByRole("dialog").getByLabel("Motif *").fill("Famille sans ressources");
    await c.getByRole("dialog").getByRole("button", { name: "Envoyer au Directeur général" }).click();
    await c.getByRole("status").filter({ hasText: "Demande de crédit envoyée au Directeur général." }).waitFor();
    await c.goto(`${BASE}/credits`);
    await c.getByText("Décision réservée au Directeur général.").waitFor();
    assert.equal(await c.getByRole("button", { name: "Approuver" }).count(), 0, "le caissier ne peut pas approuver");
  });
  await t.test("Directeur général (téléphone) : approuve la demande", async () => {
    const g = await openAs(browser, errors, dg.username, undefined, { width: 390, height: 844 });
    await g.goto(`${BASE}/credits`);
    await g.getByText("Famille sans ressources").waitFor();
    await g.getByLabel("Note de décision").fill("Accord exceptionnel");
    await g.getByRole("button", { name: "Approuver" }).click();
    await g.getByRole("dialog", { name: "Approuver ce crédit ?" }).getByRole("button", { name: "Approuver" }).click();
    await g.getByRole("status").filter({ hasText: "Crédit approuvé" }).waitFor();
    await g.getByRole("tab", { name: /Dettes/ }).click();
    await g.getByText(/reste 3,00 USD/).waitFor();
    assert.ok(await overflowPx(g) <= 0);
    await g.screenshot({ path: path.join(SHOTS, "p10-telephone-dg-dettes.png"), fullPage: true });
  });
  await t.test("retour du patient : dette visible, puis soldée", async () => {
    await c.goto(`${BASE}/patients/${patientId}`);
    await c.getByText("Dette antérieure").waitFor();
    await c.goto(invoiceUrl);
    await c.getByLabel("Montant reçu *").fill("3");
    await c.getByRole("button", { name: "Enregistrer le paiement" }).click();
    await c.getByRole("status").filter({ hasText: /Paiement enregistré/ }).waitFor();
    await c.getByText("Payée", { exact: true }).first().waitFor();
    assert.equal((await db.debt.findFirstOrThrow({ where: { patientId } })).status, "SETTLED");
    await c.goto(`${BASE}/patients/${patientId}`);
    assert.equal(await c.getByText("Dette antérieure").count(), 0);
  });
  await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
});
