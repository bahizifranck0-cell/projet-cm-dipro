// Module Caisse (transfert PREMIDIS) dans le navigateur : ouverture, entrée, sortie, billetage, clôture, historique, rapport.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";
import { BASE, axeViolations, overflowPx, startServer, stopServer } from "./lib/server";
import { account, openAs, type Acc } from "./lib/accounts";
import { db } from "../../src/server/db";

const tag = `cai${Date.now().toString(36)}`;
let server: ChildProcess, browser: Browser;
const errors: string[] = [];
let cashier: Acc, finance: Acc;

before(async () => {
  [cashier, finance] = [await account(tag, "CAISSIER", "Imani", "Caisse"), await account(tag, "FINANCE", "Benoit", "Finance")];
  server = await startServer(); browser = await chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); await db.$disconnect(); });

const dialog = (p: Page) => p.getByRole("dialog");

test("Caisse — session complète", async (t) => {
  const c = await openAs(browser, errors, cashier.username);
  await t.test("aucune session : invitation à ouvrir la caisse", async () => {
    await c.goto(`${BASE}/caisse`);
    await c.getByRole("heading", { name: "Aucune session USD ouverte" }).waitFor();
    assert.deepEqual(await axeViolations(c), []);
  });
  await t.test("ouverture avec un fond de 50 USD", async () => {
    await c.getByRole("button", { name: "Ouvrir la caisse" }).click();
    await dialog(c).getByLabel("Fond de caisse (USD)").fill("50");
    await dialog(c).getByRole("button", { name: "Ouvrir" }).click();
    await c.getByRole("status").filter({ hasText: "Session USD ouverte." }).waitFor();
    await c.getByText("Solde théorique").waitFor();
    await c.getByText("50,00 USD").first().waitFor();
  });
  await t.test("entrée de 20 et sortie de 5 : solde théorique à 65", async () => {
    await c.getByRole("button", { name: "Entrée" }).click();
    await dialog(c).getByLabel("Montant (USD) *").fill("20");
    await dialog(c).getByLabel("Catégorie").selectOption("apport");
    await dialog(c).getByLabel("Description").fill("Apport de la direction");
    await dialog(c).getByRole("button", { name: "Enregistrer" }).click();
    await c.getByRole("status").filter({ hasText: /Opération CAI-.* enregistrée/ }).waitFor();
    await c.getByText("Apport de la direction").waitFor();
    await c.getByRole("button", { name: "Sortie" }).click();
    await dialog(c).getByLabel("Montant (USD) *").fill("5");
    await dialog(c).getByLabel("Catégorie").selectOption("transport");
    await dialog(c).getByLabel("Méthode").selectOption("mobile");
    await dialog(c).getByRole("button", { name: "Enregistrer" }).click();
    await c.getByText(/Mobile money • Transport/).waitFor();
    await c.getByText("65,00 USD").waitFor();
    assert.deepEqual(await axeViolations(c), []);
  });
  await t.test("billetage : écart calculé en direct, clôture sans écart", async () => {
    await c.getByRole("button", { name: "Clôturer" }).click();
    await dialog(c).getByText("Solde attendu").waitFor();
    await dialog(c).getByLabel("Nombre de coupures de 50").fill("1");
    await dialog(c).getByLabel("Nombre de coupures de 10").fill("1");
    await dialog(c).getByText("-5,00 USD").waitFor();
    await dialog(c).getByLabel("Nombre de coupures de 5").fill("1");
    await dialog(c).getByText("+0,00 USD").waitFor();
    assert.deepEqual(await axeViolations(c), []);
    await dialog(c).getByRole("button", { name: "Clôturer" }).click();
    await c.getByRole("status").filter({ hasText: "Session clôturée (écart +0.00 USD)." }).waitFor();
    await c.getByRole("heading", { name: "Aucune session USD ouverte" }).waitFor();
  });
  await t.test("historique et rapport", async () => {
    await c.getByRole("link", { name: "Historique des sessions" }).click();
    await c.getByText("Clôturée sans écart").first().waitFor();
    await c.getByText("Billetage").first().click();
    await c.getByText("50 × 1 = 50,00 USD").waitFor();
    await c.getByRole("link", { name: "Rapport" }).click();
    await c.getByRole("heading", { name: "Rapport de caisse" }).waitFor();
    await c.getByText("Apport").first().waitFor();
    assert.deepEqual(await axeViolations(c), []);
  });
  await t.test("factures : le parcours de facturation reste disponible", async () => {
    await c.getByRole("link", { name: /^Factures/ }).click();
    await c.getByRole("searchbox", { name: "Rechercher une facture" }).or(c.getByLabel("Rechercher une facture")).first().waitFor();
    await c.getByText("Encaissé aujourd'hui (USD)").waitFor();
  });
  await t.test("téléphone : sans débordement horizontal", async () => {
    const m = await openAs(browser, errors, cashier.username, undefined, { width: 390, height: 844 });
    await m.goto(`${BASE}/caisse?devise=CDF`);
    await m.getByRole("heading", { name: "Aucune session CDF ouverte" }).waitFor();
    assert.ok((await overflowPx(m)) <= 0);
    assert.deepEqual(await axeViolations(m), []);
  });
  await t.test("la Finance consulte la caisse sans pouvoir opérer", async () => {
    const f = await openAs(browser, errors, finance.username);
    await f.goto(`${BASE}/caisse?vue=historique`);
    await f.getByText("Clôturée sans écart").first().waitFor();
    assert.equal(await f.getByRole("button", { name: /Ouvrir/ }).count(), 0);
  });
  assert.deepEqual(errors, []);
});
