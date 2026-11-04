// Phase 5 — patients, secrétariat, réception : parcours réels par rôle.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";
import { BASE, axeViolations, loginAs, overflowPx, startServer, stopServer } from "./lib/server";
import { db } from "../../src/server/db";
import { hashPassword } from "../../src/server/auth/password";

const SHOTS = process.env.E2E_SHOTS ?? "test-results";
const run = Date.now().toString(36);
const PW = "MotDePasse2026";
let server: ChildProcess, browser: Browser;
const errors: string[] = [];
const people: Record<string, { username: string; empId: string; name: string }> = {};
let depName = "";

async function account(role: string, first: string, last: string) {
  const r = await db.role.findUniqueOrThrow({ where: { code: role } });
  const e = await db.employee.create({ data: { matricule: `E5-${role}-${run}`, firstName: first, lastName: `${last}${run}`, position: r.name } });
  const u = await db.user.create({ data: { username: `${role.toLowerCase()}.${run}`, passwordHash: await hashPassword(PW), roleId: r.id, employeeId: e.id, mustChangePassword: false } });
  return { username: u.username, empId: e.id, name: `${last}${run}`.toUpperCase() };
}

before(async () => {
  depName = `Médecine générale ${run}`;
  await db.department.create({ data: { code: `MG-${run}`, name: depName } });
  people.secr = await account("SECRETAIRE", "Grace", "Secr");
  people.recep = await account("RECEPTIONNISTE", "Amani", "Recep");
  people.doc = await account("MEDECIN", "Moise", "Docteur");
  server = await startServer();
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); await db.$disconnect(); });

async function open(user: string, vp = { width: 1366, height: 900 }) {
  const page = await (await browser.newContext({ viewport: vp, locale: "fr-FR" })).newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} : ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${page.url()} : ${e.message}`));
  await loginAs(page, user, PW);
  await page.waitForURL(`${BASE}/`);
  return page;
}

const LAST = `MUHINDO${run}`.toUpperCase();
let patientUrl = "";

test("Phase 5 — secrétariat et réception", async (t) => {
  const secr = await open(people.secr.username, { width: 390, height: 844 }); // la secrétaire travaille sur téléphone
  const recep = await open(people.recep.username);

  await t.test("secrétaire : création d'un dossier (téléphone)", async () => {
    await secr.goto(`${BASE}/patients/nouveau`);
    await secr.getByLabel("Nom *", { exact: true }).fill(LAST);
    await secr.getByLabel("Post-nom").fill("Kasereka");
    await secr.getByLabel("Prénom *").fill("Élodie");
    await secr.getByLabel("Sexe").selectOption("F");
    await secr.getByLabel("Date de naissance").fill("1990-05-12");
    await secr.getByLabel("Téléphone").fill("0991 234 567");
    await secr.getByLabel("Adresse").fill("Goma, Himbi");
    await secr.getByRole("button", { name: "Créer le dossier" }).click();
    await secr.waitForURL(/\/patients\/c[a-z0-9]+\?cree=1/);
    patientUrl = secr.url().split("?")[0];
    await secr.getByRole("heading", { name: new RegExp(`${LAST} KASEREKA Élodie`) }).waitFor();
    await secr.getByText(/^P-\d{4}-\d{5}$/).waitFor();
    await secr.reload();
    await secr.getByText("0991 234 567").first().waitFor(); // retrouvé après rechargement
    assert.ok(await overflowPx(secr) <= 0);
    await secr.screenshot({ path: path.join(SHOTS, "p5-telephone-dossier.png"), fullPage: true });
  });

  await t.test("secrétaire : doublon détecté (même téléphone, autre format), pas de second dossier", async () => {
    const before = await db.patient.count();
    await secr.goto(`${BASE}/patients/nouveau`);
    await secr.getByLabel("Nom *", { exact: true }).fill("Muhindo");
    await secr.getByLabel("Prénom *").fill("Elodie");
    await secr.getByLabel("Téléphone").fill("+243 991-234-567");
    await secr.getByRole("button", { name: "Créer le dossier" }).click();
    const warn = secr.getByRole("alert").filter({ hasText: "Ce patient a peut-être déjà un dossier" });
    await warn.waitFor();
    await warn.getByText(/même téléphone/).waitFor();
    assert.deepEqual(await axeViolations(secr), []);
    assert.ok(await overflowPx(secr) <= 0);
    await secr.screenshot({ path: path.join(SHOTS, "p5-telephone-doublon.png"), fullPage: true });
    assert.equal(await db.patient.count(), before, "aucun dossier créé");
    await warn.getByRole("link", { name: "Ouvrir ce dossier" }).click();
    await secr.waitForURL(patientUrl);
  });

  await t.test("recherche sans accents et dans le désordre", async () => {
    await secr.goto(`${BASE}/patients?q=${encodeURIComponent(`elodie ${LAST.toLowerCase()}`)}`);
    await secr.getByRole("link", { name: new RegExp(LAST) }).waitFor();
    await secr.goto(`${BASE}/patients?q=234567`);
    await secr.getByRole("link", { name: new RegExp(LAST) }).waitFor();
  });

  await t.test("réceptionniste : pas de création de dossier", async () => {
    await recep.goto(`${BASE}/patients`);
    assert.equal(await recep.getByRole("link", { name: "Nouveau dossier" }).count(), 0);
    await recep.goto(`${BASE}/patients/nouveau`);
    await recep.waitForURL(/acces-refuse/);
    await recep.goto(patientUrl);
    assert.equal(await recep.getByRole("link", { name: "Modifier" }).count(), 0);
  });

  await t.test("réceptionniste : arrivée signalée urgente, file d'attente", async () => {
    await recep.goto(patientUrl);
    await recep.getByRole("button", { name: "Enregistrer l'arrivée" }).click();
    const dlg = recep.getByRole("dialog", { name: "Arrivée du patient" });
    await dlg.getByLabel("Motif de la visite").fill("Fièvre depuis 3 jours");
    await dlg.getByLabel("Situation urgente").check();
    assert.deepEqual(await axeViolations(recep), []);
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await recep.getByRole("status").filter({ hasText: "Arrivée enregistrée" }).waitFor();
    await dlg.waitFor({ state: "hidden" });
    await recep.getByText("Passage en cours : En attente d'orientation").waitFor();
    assert.equal(await recep.getByRole("button", { name: "Enregistrer l'arrivée" }).count(), 0, "pas de second passage");
    await recep.goto(`${BASE}/reception`);
    const item = recep.getByRole("listitem").filter({ hasText: LAST });
    await item.getByText("Urgent").waitFor();
    await item.getByText("En attente d'orientation").waitFor();
  });

  await t.test("réceptionniste : orientation vers un service et un médecin", async () => {
    const item = recep.getByRole("listitem").filter({ hasText: LAST });
    await item.getByRole("button", { name: /^Orienter/ }).click();
    const dlg = recep.getByRole("dialog", { name: /Orienter/ });
    await dlg.getByLabel("Service").selectOption({ label: depName });
    await dlg.getByLabel("Médecin").selectOption({ label: `Dr ${people.doc.name} Moise` });
    await dlg.getByRole("button", { name: "Orienter" }).click();
    await recep.getByRole("status").filter({ hasText: "Orientation enregistrée." }).waitFor();
    await recep.reload();
    const again = recep.getByRole("listitem").filter({ hasText: LAST });
    await again.getByText("Orienté", { exact: true }).waitFor();
    await again.getByText(`→ ${depName} — Dr ${people.doc.name} Moise`).waitFor();
    await recep.screenshot({ path: path.join(SHOTS, "p5-ordinateur-file.png"), fullPage: true });
  });

  await t.test("réceptionniste : annulation motivée, visible dans l'historique", async () => {
    const item = recep.getByRole("listitem").filter({ hasText: LAST });
    await item.getByRole("button", { name: /Annuler le passage/ }).click();
    const dlg = recep.getByRole("dialog", { name: "Annuler ce passage ?" });
    await dlg.getByRole("button", { name: "Annuler le passage" }).click();
    await dlg.getByText("Le motif est obligatoire.").or(dlg.locator("input:invalid")).first().waitFor(); // champ requis
    await dlg.getByLabel("Motif *").fill("Patient reparti avant l'orientation");
    await dlg.getByRole("button", { name: "Annuler le passage" }).click();
    await recep.getByRole("status").filter({ hasText: "Passage annulé." }).waitFor();
    await recep.reload();
    assert.equal(await recep.getByRole("listitem").filter({ hasText: LAST }).count(), 0);
    await recep.goto(`${BASE}/reception?vue=jour`);
    await recep.getByRole("listitem").filter({ hasText: LAST }).getByText("Annulé : Patient reparti avant l'orientation").waitFor();
    await recep.goto(patientUrl);
    await recep.getByText("Motif d'annulation : Patient reparti avant l'orientation").waitFor();
    await recep.getByRole("button", { name: "Enregistrer l'arrivée" }).waitFor(); // nouveau passage de nouveau possible
  });

  await t.test("secrétaire : modification tracée dans le journal", async () => {
    await secr.goto(patientUrl);
    await secr.getByRole("link", { name: "Modifier" }).click();
    await secr.getByLabel("Téléphone").fill("0812 000 111");
    await secr.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await secr.waitForURL(/modifie=1/);
    await secr.getByText("0812 000 111").first().waitFor();
    const log = await db.auditLog.findFirst({ where: { module: "patients", action: "UPDATE", entityId: patientUrl.split("/").pop() } });
    assert.deepEqual((log!.details as Record<string, { after: string }>).phone.after, "0812 000 111");
  });

  await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
});
