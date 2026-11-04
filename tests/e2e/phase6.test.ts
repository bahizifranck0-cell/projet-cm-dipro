// Phase 6 — spécialités dynamiques, consultation adaptée, ordonnance, rendez-vous (scénario F + A).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";
import { ADMIN, BASE, axeViolations, loginAs, overflowPx, startServer, stopServer } from "./lib/server";
import { db } from "../../src/server/db";
import { hashPassword } from "../../src/server/auth/password";

const SHOTS = process.env.E2E_SHOTS ?? "test-results";
const run = Date.now().toString(36);
const PW = "MotDePasse2026";
let server: ChildProcess, browser: Browser;
const errors: string[] = [];
const P: Record<string, { username: string; empId: string; last: string }> = {};
let patientId = "";

async function account(role: string, first: string, last: string) {
  const r = await db.role.findUniqueOrThrow({ where: { code: role } });
  const e = await db.employee.create({ data: { matricule: `E6-${role}-${run}`, firstName: first, lastName: `${last}${run}`, position: r.name } });
  const u = await db.user.create({ data: { username: `p6${role.toLowerCase()}.${run}`, passwordHash: await hashPassword(PW), roleId: r.id, employeeId: e.id, mustChangePassword: false } });
  return { username: u.username, empId: e.id, last: `${last}${run}`.toUpperCase() };
}
async function open(u: string, p: string, vp = { width: 1366, height: 900 }) {
  const page = await (await browser.newContext({ viewport: vp, locale: "fr-FR" })).newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} : ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${page.url()} : ${e.message}`));
  await loginAs(page, u, p); await page.waitForURL(`${BASE}/`);
  return page;
}

before(async () => {
  P.dent = await account("MEDECIN", "Esther", "Dentiste");
  P.recep = await account("RECEPTIONNISTE", "Amani", "Accueil");
  patientId = (await db.patient.create({ data: { patientNumber: `P6-${run}`, lastName: `BAHATI${run}`, firstName: "Jean", searchName: `bahati${run} jean` } })).id;
  server = await startServer(); browser = await chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); await db.$disconnect(); });

const SPEC = `Dentisterie ${run}`;

test("Phase 6 — spécialités, consultation, ordonnance, rendez-vous", async (t) => {
  const admin = await open(ADMIN.u, ADMIN.p);

  await t.test("administrateur : nouvelle spécialité, formulaire sur mesure, médecin affecté", async () => {
    await admin.goto(`${BASE}/parametres/specialites`);
    await admin.getByLabel("Nom de la spécialité *").fill(SPEC);
    await admin.getByRole("button", { name: "Créer la spécialité" }).click();
    await admin.waitForURL(/\/parametres\/specialites\/c/);
    const builder = admin.locator("form").filter({ has: admin.getByRole("button", { name: "Enregistrer une nouvelle version" }) });
    await builder.getByLabel("Libellé").fill("Dent concernée");
    await builder.getByLabel("Obligatoire").check();
    await builder.getByRole("button", { name: "Ajouter" }).click();
    await builder.getByLabel("Libellé").fill("Soin réalisé");
    await builder.getByLabel("Type").selectOption("select");
    await builder.getByLabel("Choix (séparés par des virgules)").fill("Détartrage, Extraction, Obturation");
    await builder.getByRole("button", { name: "Ajouter" }).click();
    await builder.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();
    await admin.getByRole("status").filter({ hasText: "Formulaire enregistré (version 1)" }).waitFor();
    await admin.getByText("À valider par les professionnels de santé").waitFor();
    const assign = admin.locator("form").filter({ has: admin.getByRole("button", { name: "Affecter" }) });
    await assign.locator("select[name=employeeId]").selectOption({ label: `${P.dent.last} Esther — Médecin` });
    await assign.getByRole("button", { name: "Affecter" }).click();
    await admin.getByRole("status").filter({ hasText: "Médecin affecté." }).waitFor();
    await admin.reload();
    await admin.getByText(`Dr ${P.dent.last} Esther`, { exact: true }).waitFor();
    assert.deepEqual(await axeViolations(admin), []);
  });

  const recep = await open(P.recep.username, PW);
  await t.test("réception : patient orienté vers le dentiste", async () => {
    await recep.goto(`${BASE}/patients/${patientId}`);
    await recep.getByRole("button", { name: "Enregistrer l'arrivée" }).click();
    const dlg = recep.getByRole("dialog", { name: "Arrivée du patient" });
    await dlg.locator("select[name=doctorId]").selectOption({ label: `Dr ${P.dent.last} Esther — ${SPEC}` });
    await dlg.getByLabel("Motif de la visite").fill("Douleur dentaire");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await recep.waitForURL(/arrivee=1/);
  });

  const dent = await open(P.dent.username, PW, { width: 820, height: 1180 }); // tablette
  let consultUrl = "";
  await t.test("dentiste : file d'attente et ouverture de la consultation avec SON formulaire", async () => {
    await dent.goto(`${BASE}/medecin`);
    await dent.getByRole("heading", { name: `Dr Esther ${P.dent.last}` }).waitFor();
    await dent.getByText(SPEC).first().waitFor();
    await dent.getByRole("button", { name: `Recevoir BAHATI${run.toUpperCase()} Jean` }).click();
    await dent.waitForURL(/\/consultations\/c/);
    consultUrl = dent.url();
    await dent.getByLabel("Dent concernée *").waitFor();
    await dent.getByLabel("Soin réalisé").waitFor();
    assert.deepEqual(await axeViolations(dent), []);
    assert.ok(await overflowPx(dent) <= 0);
  });

  await t.test("signature refusée tant que le champ obligatoire est vide", async () => {
    await dent.getByRole("textbox", { name: "Observations" }).fill("Carie profonde sur la 36");
    await dent.getByRole("button", { name: "Signer la consultation" }).click();
    await dent.getByRole("dialog", { name: "Signer la consultation ?" }).getByRole("button", { name: "Signer" }).click();
    await dent.getByText("Le champ « Dent concernée » est obligatoire.").waitFor();
  });

  await t.test("ordonnance et rendez-vous de suivi", async () => {
    await dent.getByLabel("Dent concernée *").fill("36");
    await dent.getByLabel("Soin réalisé").selectOption("Obturation");
    await dent.getByRole("textbox", { name: "Diagnostic" }).fill("Carie dentaire 36");
    await dent.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await dent.getByRole("status").filter({ hasText: "Brouillon enregistré." }).waitFor();
    await dent.waitForTimeout(300);
    assert.equal(await dent.getByLabel("Soin réalisé").inputValue(), "Obturation", "la liste garde sa valeur après enregistrement");
    assert.equal(await dent.getByLabel("Dent concernée *").inputValue(), "36");
    await dent.getByLabel("Médicament 1").fill("Paracétamol 500 mg");
    await dent.getByLabel("Posologie").fill("1 comprimé");
    await dent.getByLabel("Fréquence").fill("3 fois par jour");
    await dent.getByLabel("Durée").fill("5 jours");
    await dent.getByRole("button", { name: "Ajouter l'ordonnance" }).click();
    await dent.getByRole("status").filter({ hasText: "Ordonnance ajoutée." }).waitFor();
    await dent.getByText("Paracétamol 500 mg").first().waitFor();
    await dent.getByRole("button", { name: "Nouveau rendez-vous" }).click();
    const dlg = dent.getByRole("dialog", { name: /Rendez-vous/ });
    await dlg.getByLabel("Motif *").fill("Contrôle après obturation");
    await dlg.getByRole("button", { name: "Enregistrer" }).click();
    await dent.getByRole("status").filter({ hasText: /Rendez-vous RDV-\d{4}-\d{5} enregistré/ }).waitFor();
  });

  await t.test("signature : consultation verrouillée, ordonnance PDF disponible", async () => {
    await dent.getByRole("button", { name: "Signer la consultation" }).click();
    await dent.getByRole("dialog", { name: "Signer la consultation ?" }).getByRole("button", { name: "Signer" }).click();
    await dent.getByRole("status").filter({ hasText: /Consultation signée/ }).waitFor();
    await dent.reload();
    await dent.getByText(/Signée le/).waitFor();
    assert.equal(await dent.getByRole("button", { name: "Signer la consultation" }).count(), 0);
    await dent.getByText("Obturation").waitFor();
    const href = await dent.getByRole("link", { name: "PDF" }).first().getAttribute("href");
    const res = await dent.request.get(`${BASE}${href}`);
    assert.equal(res.status(), 200);
    assert.equal(res.headers()["content-type"], "application/pdf");
    assert.equal((await res.body()).subarray(0, 5).toString(), "%PDF-");
    const anon = await (await browser.newContext()).request.get(`${BASE}${href}`);
    assert.equal(anon.status(), 401, "document inaccessible sans connexion");
    await dent.screenshot({ path: path.join(SHOTS, "p6-tablette-consultation.png"), fullPage: true });
  });

  await t.test("réception : rendez-vous visible avec son document, interdit de lire l'ordonnance", async () => {
    await recep.goto(`${BASE}/rendez-vous?q=${encodeURIComponent(`BAHATI${run}`)}`);
    await recep.getByText("Contrôle après obturation").waitFor();
    const href = await recep.getByRole("link", { name: /Document du rendez-vous/ }).getAttribute("href");
    assert.equal((await recep.request.get(`${BASE}${href}`)).status(), 200);
    const rx = await db.document.findFirstOrThrow({ where: { patientId, type: "PRESCRIPTION" } });
    assert.equal((await recep.request.get(`${BASE}/fichiers/documents/${rx.id}`)).status(), 403, "ordonnance réservée au personnel médical");
    await recep.goto(`${BASE}/patients/${patientId}`);
    assert.equal(await recep.getByRole("tab", { name: /Consultations/ }).count(), 0);
  });

  await t.test("dossier central : consultation, rendez-vous et documents réunis", async () => {
    await dent.goto(`${BASE}/patients/${patientId}`);
    await dent.getByRole("tab", { name: /Consultations/ }).click();
    await dent.getByText("Carie dentaire 36").waitFor();
    await dent.getByRole("tab", { name: /Documents/ }).click();
    await dent.getByText(/Ordonnance — BAHATI/).waitFor();
    await dent.getByText(/Rendez-vous RDV-/).waitFor();
    assert.match(consultUrl, /consultations/);
  });

  await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
});
