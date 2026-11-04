// Test de bout en bout : vrai serveur Next.js (build de production) + vrai navigateur.
// Prérequis : `npm run build` ; base de test vierge (scripts/test-db-reset.sh) ; Super Admin créé.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { u: process.env.E2E_ADMIN_USER ?? "superadmin", p: process.env.E2E_ADMIN_PASS ?? "AdminTest2026" };
const SHOTS = process.env.E2E_SHOTS ?? "test-results";
const run = Date.now().toString(36);
let server: ChildProcess;
let browser: Browser;

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/connexion`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Le serveur ne répond pas");
}

async function loginAs(page: Page, u: string, p: string) {
  await page.goto(`${BASE}/connexion`);
  await page.getByLabel("Identifiant").fill(u);
  await page.getByLabel("Mot de passe", { exact: true }).fill(p);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

const consoleErrors: string[] = [];
async function newPage(viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${page.url()} : ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()} : ${e.message}`));
  return page;
}

before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  try { await fetch(`${BASE}/connexion`); throw new Error(`Le port ${PORT} est déjà occupé : arrêtez l'ancien serveur.`); }
  catch (e) { if ((e as Error).message.includes("déjà occupé")) throw e; }
  // Groupe de processus dédié : on arrête le serveur ET ses processus enfants à la fin.
  server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore", env: process.env, detached: true });
  await waitForServer();
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server?.pid) try { process.kill(-server.pid, "SIGTERM"); } catch {}
});

const ROLE = `Rôle E2E ${run}`;
const USER = `agent.e2e${run}`;
const TEMP_PW = "Provisoire2026";
const NEW_PW = "Definitif2026x";

test("Phase 3 — parcours complet", async (t) => {
  const admin = await newPage();

  await t.test("sans session, toute page renvoie vers la connexion", async () => {
    await admin.goto(`${BASE}/utilisateurs`);
    assert.match(admin.url(), /\/connexion$/);
    await admin.screenshot({ path: path.join(SHOTS, "01-connexion.png") });
  });

  await t.test("mauvais mot de passe : message clair", async () => {
    await loginAs(admin, ADMIN.u, "mauvais");
    await admin.getByText("Identifiant ou mot de passe incorrect.").waitFor();
  });

  await t.test("le bouton œil affiche le mot de passe", async () => {
    const pw = admin.getByLabel("Mot de passe", { exact: true });
    await pw.fill("abc");
    await admin.getByRole("button", { name: "Afficher le mot de passe" }).click();
    assert.equal(await pw.getAttribute("type"), "text");
  });

  await t.test("connexion du Super Administrateur", async () => {
    await loginAs(admin, ADMIN.u, ADMIN.p);
    await admin.getByRole("heading", { name: /Bonjour|Bonsoir/ }).waitFor();
    for (const l of ["Utilisateurs", "Rôles et permissions", "Départements", "Journal d'audit"])
      await admin.getByRole("link", { name: l }).first().waitFor();
  });

  await t.test("création d'un département", async () => {
    await admin.goto(`${BASE}/parametres/departements`);
    await admin.getByLabel("Nom du département").fill(`Service E2E ${run}`);
    await admin.getByRole("button", { name: "Ajouter" }).click();
    await admin.getByText("Département ajouté.").waitFor();
    await admin.reload();
    await admin.locator(`input[value="Service E2E ${run}"]`).waitFor();
  });

  await t.test("création d'un employé avec photo", async () => {
    const png = path.join(SHOTS, "photo.png");
    writeFileSync(png, Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex"));
    await admin.goto(`${BASE}/personnel/nouveau`);
    await admin.getByLabel("Nom *", { exact: true }).fill(`KAHINDO${run}`);
    await admin.getByLabel("Prénom *").fill("Agent");
    await admin.getByLabel("Fonction *").fill("Agent administratif");
    await admin.getByLabel("Département").selectOption({ label: `Service E2E ${run}` });
    await admin.getByLabel("Photo").setInputFiles(png);
    await admin.getByRole("button", { name: "Enregistrer l'employé" }).click();
    await admin.waitForURL(/\/personnel\?cree=/);
    await admin.getByText(`KAHINDO${run}`.toUpperCase()).first().waitFor();
    const img = admin.getByAltText(`Photo de Agent KAHINDO${run}`);
    await img.waitFor();
    const src = await img.getAttribute("src");
    const res = await admin.request.get(`${BASE}${src}`);
    assert.equal(res.status(), 200);
    assert.equal(res.headers()["content-type"], "image/png");
    await admin.waitForFunction((alt) => { const el = document.querySelector(`img[alt="${alt}"]`) as HTMLImageElement | null; return !!el && el.complete && el.naturalWidth > 0; }, `Photo de Agent KAHINDO${run}`);
  });

  await t.test("création d'un rôle et attribution des permissions par cases à cocher", async () => {
    await admin.goto(`${BASE}/parametres/roles`);
    await admin.getByRole("button", { name: "Ajouter un rôle" }).click();
    await admin.getByLabel("Nom du rôle *").fill(ROLE);
    await admin.getByRole("button", { name: "Créer" }).click();
    await admin.waitForURL(/\/parametres\/roles\/.+/);
    await admin.locator('input[value="hr.view"]').check();
    await admin.locator('input[value="settings.view"]').check();
    await admin.getByRole("button", { name: "Enregistrer les permissions" }).click();
    await admin.getByText(/Permissions enregistrées \(2\)/).waitFor();
    await admin.reload();
    assert.ok(await admin.locator('input[value="hr.view"]').isChecked());
    assert.ok(!(await admin.locator('input[value="hr.create"]').isChecked()));
    await admin.screenshot({ path: path.join(SHOTS, "02-permissions.png"), fullPage: true });
  });

  await t.test("création du compte à partir de l'employé", async () => {
    await admin.goto(`${BASE}/utilisateurs/nouveau`);
    const opt = admin.locator("select[name=employeeId] option", { hasText: `KAHINDO${run}`.toUpperCase() });
    await admin.getByLabel("Employé *").selectOption((await opt.getAttribute("value"))!);
    await admin.getByText("Agent administratif").waitFor(); // informations reprises automatiquement
    await admin.getByLabel("Identifiant de connexion *").fill(USER);
    await admin.getByLabel("Mot de passe provisoire *").fill(TEMP_PW);
    await admin.getByLabel("Rôle *").selectOption({ label: ROLE });
    await admin.getByRole("button", { name: "Créer le compte" }).click();
    await admin.waitForURL(/\/utilisateurs\/[a-z0-9]+$/);
    await admin.getByText("Mot de passe provisoire").first().waitFor();
    await admin.screenshot({ path: path.join(SHOTS, "03-fiche-utilisateur.png"), fullPage: true });
  });

  const agent = await newPage({ width: 390, height: 844 }); // téléphone
  let agentUserUrl = "";

  await t.test("l'agent doit d'abord changer son mot de passe provisoire", async () => {
    agentUserUrl = admin.url();
    await loginAs(agent, USER, TEMP_PW);
    await agent.waitForURL(/\/compte\/mot-de-passe/);
    await agent.goto(`${BASE}/personnel`);
    await agent.waitForURL(/\/compte\/mot-de-passe/);
    await agent.locator("input[name=current]").fill(TEMP_PW);
    await agent.locator("input[name=next]").fill(NEW_PW);
    await agent.locator("input[name=confirm]").fill(NEW_PW);
    await agent.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
    await agent.getByText(/Mot de passe modifié/).waitFor();
  });

  await t.test("l'agent ne voit et n'atteint que ce que son rôle autorise", async () => {
    await agent.goto(`${BASE}/personnel`);
    await agent.getByRole("heading", { name: "Personnel" }).waitFor();
    assert.equal(await agent.getByRole("link", { name: "Nouvel employé" }).count(), 0, "pas de bouton Créer sans hr.create");
    await agent.goto(`${BASE}/personnel/nouveau`);
    await agent.waitForURL(/\/acces-refuse/);
    await agent.goto(`${BASE}/utilisateurs`);
    await agent.waitForURL(/\/acces-refuse/);
    await agent.goto(`${BASE}/parametres/roles`);
    await agent.waitForURL(/\/acces-refuse/);
    await agent.goto(`${BASE}/parametres/departements`);
    await agent.getByRole("heading", { name: /Départements/ }).waitFor();
    assert.equal(await agent.getByRole("button", { name: "Ajouter" }).count(), 0, "lecture seule sans settings.update");
    await agent.goto(`${BASE}/parametres/journal`);
    await agent.waitForURL(/\/acces-refuse/);
  });

  await t.test("affichage téléphone : pas de défilement horizontal, menu accessible", async () => {
    for (const p of ["/", "/personnel", "/parametres/departements"]) {
      await agent.goto(`${BASE}${p}`);
      const overflow = await agent.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${p} déborde de ${overflow}px`);
    }
    await agent.getByRole("button", { name: "Ouvrir le menu" }).click();
    await agent.getByRole("link", { name: "Personnel" }).waitFor();
    await agent.screenshot({ path: path.join(SHOTS, "04-mobile-menu.png") });
  });

  await t.test("retirer une permission prend effet immédiatement", async () => {
    await admin.goto(`${BASE}/parametres/roles`);
    await admin.getByRole("link", { name: new RegExp(ROLE) }).click();
    await admin.locator('input[value="hr.view"]').uncheck();
    await admin.getByRole("button", { name: "Enregistrer les permissions" }).click();
    await admin.getByText(/Permissions enregistrées \(1\)/).waitFor();
    await agent.goto(`${BASE}/personnel`);
    await agent.waitForURL(/\/acces-refuse/);
  });

  await t.test("désactiver le compte déconnecte l'agent immédiatement", async () => {
    await admin.goto(agentUserUrl);
    await admin.getByRole("button", { name: "Désactiver le compte" }).click();
    await admin.getByText(/Compte désactivé : l'utilisateur a été déconnecté/).waitFor();
    await agent.goto(`${BASE}/`);
    await agent.waitForURL(/\/connexion/);
    await loginAs(agent, USER, NEW_PW);
    await agent.getByText("Ce compte est désactivé. Contactez l'administrateur.").waitFor();
  });

  await t.test("pages d'administration sur téléphone : pas de débordement", async () => {
    const m = await newPage({ width: 390, height: 844 });
    await loginAs(m, ADMIN.u, ADMIN.p);
    await m.waitForURL(`${BASE}/`);
    const roleUrl = (await admin.goto(`${BASE}/parametres/roles`), await admin.getByRole("link", { name: new RegExp(ROLE) }).getAttribute("href"));
    for (const p of ["/utilisateurs", "/utilisateurs/nouveau", "/parametres/roles", roleUrl!, "/parametres/journal", new URL(agentUserUrl).pathname, "/personnel/nouveau"]) {
      await m.goto(`${BASE}${p}`);
      const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${p} déborde de ${overflow}px`);
    }
    await m.goto(`${BASE}${roleUrl}`);
    await m.screenshot({ path: path.join(SHOTS, "05-mobile-permissions.png"), fullPage: true });
    await m.goto(`${BASE}${new URL(agentUserUrl).pathname}`);
    await m.screenshot({ path: path.join(SHOTS, "06-mobile-fiche.png"), fullPage: true });
  });

  await t.test("le journal d'audit trace toutes ces opérations", async () => {
    await admin.goto(`${BASE}/parametres/journal`);
    for (const txt of ["Permissions modifiées", "Désactivation", "Mot de passe modifié", "Échec de connexion", "Connexion refusée (compte désactivé)"])
      await admin.getByText(txt).first().waitFor();
    await admin.goto(agentUserUrl);
    await admin.getByRole("heading", { name: "Historique des connexions" }).waitFor();
    await admin.getByText("Connexion refusée (compte désactivé)").first().waitFor();
  });

  await t.test("aucune erreur dans la console du navigateur", () => {
    assert.deepEqual(consoleErrors, []);
  });
});
