// Phase 11 — personnel, paie, bulletins versionnés (scénario G).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";
import { BASE, axeViolations, startServer, stopServer } from "./lib/server";
import { account, openAs, type Acc } from "./lib/accounts";
import { db } from "../../src/server/db";

const tag = `p11${Date.now().toString(36)}`;
let server: ChildProcess, browser: Browser;
const errors: string[] = [];
let rh: Acc, nurse: Acc, cashier: Acc;
before(async () => {
  [rh, nurse, cashier] = [await account(tag, "ADMINISTRATION", "Rose", "Rh"), await account(tag, "INFIRMIER", "Esther", "Kavira"), await account(tag, "CAISSIER", "Imani", "Caisse")];
  server = await startServer(); browser = await chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); await db.$disconnect(); });

test("Scénario G — employé et paie", async (t) => {
  const p = await openAs(browser, errors, rh.username);
  const period = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 7);
  await t.test("contrat, avance et prime ; calcul mis à jour", async () => {
    await p.goto(`${BASE}/personnel/${nurse.empId}`);
    await p.getByRole("tab", { name: /Contrats/ }).click();
    const tab = p.getByRole("tabpanel");
    await tab.getByLabel("Type *").fill("CDI");
    await tab.getByLabel("Début *").fill("2025-01-01");
    await tab.getByLabel("Salaire de base *").fill("300");
    await tab.getByRole("button", { name: "Enregistrer le contrat" }).click();
    await p.getByRole("status").filter({ hasText: "Contrat enregistré." }).waitFor();
    await p.reload();
    for (const [type, amount] of [["ADVANCE", "50"], ["BONUS", "20"]]) {
      const pay = p.getByRole("tabpanel");
      await pay.getByLabel("Type *").selectOption(type);
      await pay.getByLabel("Montant *").fill(amount);
      await pay.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await p.getByRole("status").filter({ hasText: "Opération enregistrée." }).last().waitFor();
    }
    await p.reload();
    await p.getByText("Net à payer").waitFor();
    await p.getByText("270,00 USD").first().waitFor(); // 300 + 20 − 50
    assert.deepEqual(await axeViolations(p), []);
  });
  await t.test("bulletins : deux générations = deux versions conservées", async () => {
    await p.getByRole("button", { name: "Générer le bulletin" }).click();
    await p.getByRole("status").filter({ hasText: /version 1/ }).waitFor();
    await p.getByRole("button", { name: "Générer le bulletin" }).click();
    await p.getByRole("status").filter({ hasText: /version 2/ }).waitFor();
    assert.equal(await db.payslip.count({ where: { employeeId: nurse.empId, period } }), 2);
  });
  await t.test("l'employé consulte son propre dossier ; un autre rôle est refusé", async () => {
    const n = await openAs(browser, errors, nurse.username);
    await n.getByRole("link", { name: "Mon dossier" }).click();
    await n.waitForURL(new RegExp(`/personnel/${nurse.empId}`));
    const href = await n.getByRole("link", { name: "PDF" }).first().getAttribute("href");
    assert.equal((await n.request.get(`${BASE}${href}`)).status(), 200, "son bulletin");
    const c = await openAs(browser, errors, cashier.username);
    assert.equal((await c.request.get(`${BASE}${href}`)).status(), 403, "bulletin d'un autre employé");
    await c.goto(`${BASE}/personnel/${nurse.empId}`);
    await c.waitForURL(/acces-refuse/);
  });
  await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
});
