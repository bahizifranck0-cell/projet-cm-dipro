// Phases 12 et 13 — portail patient, documents, rapports, notifications et compteurs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";
import { BASE, axeViolations, overflowPx, startServer, stopServer } from "./lib/server";
import { account, openAs, PW, type Acc } from "./lib/accounts";
import { db } from "../../src/server/db";
import { login } from "../../src/server/services/auth";
import { actorFromToken } from "../../src/server/services/sessions";
import * as cons from "../../src/server/services/consultations";
import * as lab from "../../src/server/services/laboratory";

const SHOTS = process.env.E2E_SHOTS ?? "test-results";
const tag = `p12${Date.now().toString(36)}`;
let server: ChildProcess, browser: Browser;
const errors: string[] = [];
let doc: Acc, secr: Acc, labm: Acc, dg: Acc;
let patientId = "", otherDocId = "", labReqId = "";
const LAST = `NEEMA${tag}`.toUpperCase();

before(async () => {
  [doc, secr, labm, dg] = [await account(tag, "MEDECIN", "Moise", "Doc"), await account(tag, "SECRETAIRE", "Grace", "Secr"), await account(tag, "RESP_LABORATOIRE", "Neema", "Labo"), await account(tag, "DIRECTEUR_GENERAL", "Jean", "Dg")];
  const spec = await db.specialty.create({ data: { code: `G-${tag}`, name: `Générale ${tag}` } });
  await db.doctorAssignment.create({ data: { employeeId: doc.empId, specialtyId: spec.id } });
  const t = await db.labTest.create({ data: { code: `T${tag}`.toUpperCase().slice(0, 20), name: `Glycémie ${tag}`, unit: "g/L" } });
  patientId = (await db.patient.create({ data: { patientNumber: `P-${tag}`, lastName: LAST, firstName: "Sarah", searchName: `${LAST.toLowerCase()} sarah` } })).id;
  const other = await db.patient.create({ data: { patientNumber: `PO-${tag}`, lastName: "AUTRE", firstName: "Patient", searchName: "autre patient" } });
  // Activité réelle via les services : consultation communicable avec ordonnance, analyse demandée
  const v = await db.visit.create({ data: { patientId, status: "ORIENTED", orientedToDoctorId: doc.empId } });
  const a = (await actorFromToken(((await login(doc.username, PW)) as { token: string }).token))!;
  const c = await cons.startConsultation(a, v.id, spec.id);
  await cons.saveConsultation(a, c.id, { observations: "NOTE INTERNE CONFIDENTIELLE", diagnosis: "Diabète de type 2", treatment: "Régime", patientVisible: true });
  await cons.addPrescription(a, c.id, [{ medication: "Metformine 500 mg" }]);
  labReqId = (await lab.requestLab(a, c.id, [t.id])).id;
  await cons.signConsultation(a, c.id, { closeVisit: true });
  // Document d'un AUTRE patient, communicable : ne doit jamais être accessible
  otherDocId = (await db.document.create({ data: { number: `X-${tag}`, type: "OTHER", title: "Autre", storagePath: "documents/x.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: "x", patientId: other.id, visibleToPatient: true, createdById: secr.userId } })).id;
  server = await startServer(); browser = await chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); await db.$disconnect(); });

test("Phase 13 — notifications et compteurs", async (t) => {
  const l = await openAs(browser, errors, labm.username);
  await t.test("le laboratoire voit un compteur sur son module et dans les notifications", async () => {
    await l.locator("#cmdpro-sidebar").getByRole("link", { name: /Laboratoire/ }).getByLabel(/1 élément\(s\) à traiter/).waitFor();
    await l.goto(`${BASE}/notifications`);
    await l.getByText(/Nouvelle demande LAB-/).waitFor();
  });
  await t.test("la cloche de l'en-tête affiche le nombre de non lues et ouvre les notifications", async () => {
    await l.goto(`${BASE}/laboratoire`);
    assert.equal(await l.locator("#cmdpro-sidebar").getByRole("link", { name: "Notifications" }).count(), 0);
    const bell = l.getByRole("link", { name: /Notifications : 1 non lue/ });
    await bell.click();
    await l.waitForURL(`${BASE}/notifications`);
    await l.getByText(/Nouvelle demande LAB-/).waitFor();
  });
  await t.test("ouvrir la demande fait baisser le compteur", async () => {
    await l.getByText(/Nouvelle demande LAB-/).click();
    await l.waitForURL(new RegExp(`/laboratoire/${labReqId}`));
    await l.reload();
    assert.equal(await l.locator("#cmdpro-sidebar").getByRole("link", { name: /Laboratoire/ }).getByLabel(/à traiter/).count(), 0);
    assert.equal(await db.notification.count({ where: { recipientUserId: labm.userId, readAt: null } }), 0);
  });
});

test("Phase 12 — portail patient", async (t) => {
  await t.test("la secrétaire crée l'accès au portail", async () => {
    const s = await openAs(browser, errors, secr.username);
    await s.goto(`${BASE}/patients/${patientId}`);
    await s.getByLabel("Identifiant du patient").fill(`sarah.${tag}`);
    await s.getByLabel("Mot de passe provisoire").fill("Provisoire2026");
    await s.getByRole("button", { name: "Créer l'accès" }).click();
    await s.getByRole("status").filter({ hasText: "Compte du portail créé" }).waitFor();
  });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" })).newPage();
  p.on("pageerror", (e) => errors.push(`${p.url()} : ${e.message}`));
  await t.test("le patient se connecte et doit changer son mot de passe provisoire", async () => {
    await p.goto(`${BASE}/portail/connexion`);
    await p.getByLabel("Identifiant").fill(`sarah.${tag}`);
    await p.getByLabel("Mot de passe", { exact: true }).fill("Provisoire2026");
    await p.getByRole("button", { name: "Accéder à mon dossier" }).click();
    await p.waitForURL(/portail\/mot-de-passe/);
    await p.goto(`${BASE}/portail`);
    await p.waitForURL(/portail\/mot-de-passe/);
    await p.locator("input[name=current]").fill("Provisoire2026");
    await p.locator("input[name=next]").fill("MonDossier2026");
    await p.locator("input[name=confirm]").fill("MonDossier2026");
    await p.getByRole("button", { name: "Enregistrer" }).click();
    await p.waitForURL(/portail\?mdp=1/);
  });
  await t.test("il voit SON dossier communicable, pas les notes internes ni les résultats non validés", async () => {
    await p.getByText("Diabète de type 2").waitFor();
    await p.getByText(/Metformine 500 mg/).waitFor();
    assert.equal(await p.getByText("NOTE INTERNE CONFIDENTIELLE").count(), 0, "observations internes jamais visibles");
    await p.getByText("résultat en attente").waitFor();
    assert.deepEqual(await axeViolations(p), []);
    assert.ok(await overflowPx(p) <= 0);
    await p.screenshot({ path: path.join(SHOTS, "p12-telephone-portail.png"), fullPage: true });
  });
  await t.test("téléchargement de son ordonnance ; document d'un autre patient refusé", async () => {
    const href = await p.getByRole("link", { name: "Télécharger" }).first().getAttribute("href");
    const res = await p.request.get(`${BASE}${href}`);
    assert.equal(res.status(), 200); assert.equal(res.headers()["content-type"], "application/pdf");
    assert.equal((await p.request.get(`${BASE}/portail/documents/${otherDocId}`)).status(), 404, "jamais le document d'un autre patient");
    assert.equal((await p.request.get(`${BASE}/fichiers/documents/${otherDocId}`)).status(), 401, "la session patient n'ouvre pas l'espace du personnel");
    await p.goto(`${BASE}/patients`);
    await p.waitForURL(/\/connexion$/);
  });
  await t.test("une session du personnel n'ouvre pas le portail", async () => {
    const s = await openAs(browser, errors, secr.username);
    await s.goto(`${BASE}/portail`);
    await s.waitForURL(/portail\/connexion/);
  });
});

test("Phase 12 — documents et rapports", async (t) => {
  const g = await openAs(browser, errors, dg.username);
  await t.test("rapports calculés et export PDF", async () => {
    await g.goto(`${BASE}/rapports`);
    await g.getByRole("heading", { name: "Activités médicales" }).waitFor();
    await g.getByText(`Dr ${doc.last} Moise`, { exact: true }).waitFor();
    const href = await g.getByRole("link", { name: "Exporter en PDF" }).getAttribute("href");
    const res = await g.request.get(`${BASE}${href}`);
    assert.equal(res.status(), 200); assert.equal(res.headers()["content-type"], "application/pdf");
    assert.ok(await db.document.findFirst({ where: { type: "REPORT", createdById: dg.userId } }));
    assert.deepEqual(await axeViolations(g), []);
  });
  await t.test("module Documents : seulement les types autorisés", async () => {
    await g.goto(`${BASE}/documents`);
    await g.getByText(/Rapport d'activité/).first().waitFor();
    assert.equal(await g.locator("select[name=type] option", { hasText: "Bulletin de paie" }).count(), 1, "le DG a « Personnel — Voir » dans la proposition par défaut");
    const l = await openAs(browser, errors, labm.username);
    await l.goto(`${BASE}/documents`);
    assert.equal(await l.locator("select[name=type] option", { hasText: "Bulletin de paie" }).count(), 0, "pas de bulletins sans droit RH");
    await l.getByRole("heading", { name: "Documents" }).waitFor();
  });
  await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
});
