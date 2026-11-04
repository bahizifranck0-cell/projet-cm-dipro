// Phase 7 — urgences, hospitalisation, lits, suivi, sortie bloquée sans paiement (scénario C, première partie).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";
import { BASE, axeViolations, loginAs, overflowPx, startServer, stopServer } from "./lib/server";
import { db } from "../../src/server/db";
import { hashPassword } from "../../src/server/auth/password";

const SHOTS = process.env.E2E_SHOTS ?? "test-results";
const run = Date.now().toString(36);
const PW = "MotDePasse2026";
let server: ChildProcess, browser: Browser;
const errors: string[] = [];
const P: Record<string, { username: string; empId: string; last: string }> = {};
let patientId = "", visitId = "";

async function account(role: string, first: string, last: string) {
  const r = await db.role.findUniqueOrThrow({ where: { code: role } });
  const e = await db.employee.create({ data: { matricule: `E7-${role}-${run}`, firstName: first, lastName: `${last}${run}`, position: r.name } });
  const u = await db.user.create({ data: { username: `p7${role.toLowerCase()}.${run}`, passwordHash: await hashPassword(PW), roleId: r.id, employeeId: e.id, mustChangePassword: false } });
  return { username: u.username, empId: e.id, last: `${last}${run}`.toUpperCase() };
}
async function open(u: string, vp = { width: 1366, height: 900 }) {
  const page = await (await browser.newContext({ viewport: vp, locale: "fr-FR" })).newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} : ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${page.url()} : ${e.message}`));
  await loginAs(page, u, PW); await page.waitForURL(`${BASE}/`);
  return page;
}

before(async () => {
  P.doc = await account("MEDECIN", "Moise", "Medecin");
  P.resp = await account("RESP_URGENCES_HOSPITALISATION", "Sifa", "Hospit");
  const spec = await db.specialty.create({ data: { code: `MG7-${run}`, name: `Médecine générale ${run}` } });
  await db.doctorAssignment.create({ data: { employeeId: P.doc.empId, specialtyId: spec.id } });
  const p = await db.patient.create({ data: { patientNumber: `P7-${run}`, lastName: `KAVIRA${run}`, firstName: "Anne", searchName: `kavira${run} anne` } });
  patientId = p.id;
  visitId = (await db.visit.create({ data: { patientId, status: "ORIENTED", orientedToDoctorId: P.doc.empId, reason: "Fièvre élevée" } })).id;
  // Un tarif d'hospitalisation existe : la sortie exigera le paiement
  await db.tariffItem.create({ data: { code: `HOSP7-${run}`, name: "Journée d'hospitalisation", category: "HOSPITALIZATION", price: "15.00", currency: "USD", unit: "jour" } });
  server = await startServer(); browser = await chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); await db.$disconnect(); });

test("Phase 7 — hospitalisation", async (t) => {
  const resp = await open(P.resp.username);
  await t.test("responsable : création d'une chambre et de deux lits", async () => {
    await resp.goto(`${BASE}/hospitalisation/chambres`);
    await resp.getByLabel("Code *").fill(`H${run}`);
    await resp.getByLabel("Nom *").fill("Salle commune");
    await resp.getByLabel("Catégorie *").fill("Commune");
    await resp.getByRole("button", { name: "Créer la chambre" }).click();
    await resp.getByRole("status").filter({ hasText: "Chambre créée." }).waitFor();
    for (const code of ["1", "2"]) {
      await resp.getByLabel(`Nouveau lit dans H${run.toUpperCase()}`).fill(code);
      await resp.getByLabel(`Nouveau lit dans H${run.toUpperCase()}`).press("Enter");
      await resp.getByText(`Lit ${code}`, { exact: true }).waitFor();
    }
    assert.deepEqual(await axeViolations(resp), []);
  });

  const doc = await open(P.doc.username);
  await t.test("médecin : hospitalise le patient depuis la consultation", async () => {
    await doc.goto(`${BASE}/medecin`);
    await doc.getByRole("button", { name: `Recevoir KAVIRA${run.toUpperCase()} Anne` }).click();
    await doc.waitForURL(/consultations/);
    await doc.getByRole("button", { name: "Hospitaliser" }).click();
    const dlg = doc.getByRole("dialog", { name: "Admission" });
    await dlg.getByLabel("Motif").fill("Paludisme grave, surveillance");
    await dlg.getByRole("button", { name: "Admettre" }).click();
    await doc.waitForURL(/\/hospitalisation\/c.*admis=1/);
  });

  await t.test("responsable : notifié, attribue un lit puis transfère, note de suivi", async () => {
    assert.ok(await db.notification.findFirst({ where: { recipientUser: undefined, type: "ADMISSION", recipientUserId: (await db.user.findUniqueOrThrow({ where: { username: P.resp.username } })).id } }));
    await resp.goto(`${BASE}/hospitalisation`);
    await resp.getByText("Lit à attribuer").waitFor();
    await resp.getByRole("link", { name: new RegExp(`KAVIRA${run}`, "i") }).first().click();
    await resp.locator("select[name=bedId]").selectOption({ label: `H${run.toUpperCase()} · lit 1 — Commune` });
    await resp.getByRole("button", { name: "Attribuer" }).click();
    await resp.getByRole("status").filter({ hasText: "Lit attribué." }).waitFor();
    await resp.getByText(`H${run.toUpperCase()} · lit 1`).first().waitFor();
    await resp.locator("select[name=bedId]").selectOption({ label: `H${run.toUpperCase()} · lit 2 — Commune` });
    await resp.getByRole("button", { name: "Transférer" }).click();
    await resp.getByRole("status").filter({ hasText: "Lit attribué." }).waitFor();
    await resp.getByLabel("Note *").fill("Température 39,5 °C, perfusion posée");
    await resp.getByRole("button", { name: "Ajouter la note" }).click();
    await resp.getByText("Température 39,5 °C, perfusion posée").waitFor();
    await resp.getByRole("tab", { name: /Mouvements de lit/ }).click();
    await resp.getByText(/lit 1/).first().waitFor();
    assert.equal(await db.bedAssignment.count({ where: { admission: { patientId } } }), 2);
    assert.deepEqual(await axeViolations(resp), []);
  });

  await t.test("sortie bloquée tant que la facture n'est pas réglée", async () => {
    await resp.getByRole("button", { name: "Sortie du patient" }).click();
    const dlg = resp.getByRole("dialog", { name: "Sortie du patient" });
    await dlg.getByRole("button", { name: "Confirmer la sortie" }).click();
    await dlg.getByText(/Sortie bloquée : des prestations ne sont pas encore facturées/).waitFor();
    const a = await db.admission.findFirstOrThrow({ where: { patientId } });
    assert.equal(a.status, "ACTIVE");
    const stay = await db.charge.findFirstOrThrow({ where: { source: "HOSPITALIZATION", sourceId: a.id } });
    assert.equal(stay.unitPrice.toString(), "15");
    await resp.keyboard.press("Escape");
  });

  await t.test("tableau des lits sur téléphone", async () => {
    const m = await open(P.resp.username, { width: 390, height: 844 });
    await m.goto(`${BASE}/hospitalisation`);
    await m.getByText("Occupation des lits").waitFor();
    assert.ok(await overflowPx(m) <= 0);
    await m.screenshot({ path: path.join(SHOTS, "p7-telephone-lits.png"), fullPage: true });
  });

  await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
  assert.ok(visitId);
});
