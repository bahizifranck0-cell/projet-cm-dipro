// Phase 4 — design system : accessibilité, responsive, navigation, composants.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";
import { ADMIN, BASE, axeViolations, loginAs, overflowPx, startServer, stopServer } from "./lib/server";

const SHOTS = process.env.E2E_SHOTS ?? "test-results";
let server: ChildProcess;
let browser: Browser;
before(async () => { mkdirSync(SHOTS, { recursive: true }); server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); stopServer(server); });

const VIEWPORTS = [
  { name: "ordinateur", width: 1366, height: 900 },
  { name: "tablette", width: 820, height: 1180 },
  { name: "telephone", width: 390, height: 844 },
] as const;

const PAGES = ["/", "/personnel", "/personnel/nouveau", "/utilisateurs", "/utilisateurs/nouveau", "/parametres/roles",
  "/parametres/departements", "/parametres/journal", "/parametres/guide-visuel", "/compte/mot-de-passe"];

async function session(vp: (typeof VIEWPORTS)[number]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "fr-FR" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} : ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${page.url()} : ${e.message}`));
  return { page, errors };
}

for (const vp of VIEWPORTS) {
  test(`Accessibilité et mise en page — ${vp.name} (${vp.width}px)`, async (t) => {
    const { page, errors } = await session(vp);

    await t.test("page de connexion conforme", async () => {
      await page.goto(`${BASE}/connexion`);
      assert.deepEqual(await axeViolations(page), []);
      assert.ok(await overflowPx(page) <= 0);
    });

    await loginAs(page, ADMIN.u, ADMIN.p);
    await page.waitForURL(`${BASE}/`);
    const roleHref = await (await page.goto(`${BASE}/parametres/roles`), page.locator("a[href^='/parametres/roles/']").first().getAttribute("href"));
    const userHref = await (await page.goto(`${BASE}/utilisateurs`), page.locator("a[href^='/utilisateurs/c']").first().getAttribute("href"));

    for (const p of [...PAGES, roleHref!, userHref!]) {
      await t.test(`${p} : aucun défaut d'accessibilité, aucun débordement`, async () => {
        await page.goto(`${BASE}${p}`);
        assert.deepEqual(await axeViolations(page), [], p);
        const o = await overflowPx(page);
        assert.ok(o <= 0, `${p} déborde de ${o}px`);
      });
    }

    await t.test("captures d'écran", async () => {
      for (const [p, n] of [["/", "accueil"], ["/parametres/guide-visuel", "guide"], [roleHref!, "permissions"]] as const) {
        await page.goto(`${BASE}${p}`);
        await page.screenshot({ path: path.join(SHOTS, `p4-${vp.name}-${n}.png`), fullPage: n === "guide" });
      }
    });

    await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
  });
}

test("Navigation adaptée à chaque écran", async (t) => {
  await t.test("téléphone : barre basse, menu complet dans un tiroir fermable avec Échap", async () => {
    const { page } = await session(VIEWPORTS[2]);
    await loginAs(page, ADMIN.u, ADMIN.p); await page.waitForURL(`${BASE}/`);
    const bottom = page.getByRole("navigation", { name: "Navigation rapide" });
    assert.ok(await bottom.isVisible());
    assert.ok(!(await page.locator("#cmdpro-sidebar").isVisible()) || (await page.locator("#cmdpro-sidebar").boundingBox())!.x < 0);
    const box = (await bottom.boundingBox())!;
    assert.ok(box.y + box.height <= 844 && box.y > 700, "barre en bas de l'écran");
    for (const l of await bottom.getByRole("link").all()) { const b = (await l.boundingBox())!; assert.ok(b.height >= 44, "zone tactile ≥ 44px"); }
    await bottom.getByRole("button", { name: "Menu" }).click();
    const side = page.locator("#cmdpro-sidebar");
    await side.getByRole("link", { name: "Utilisateurs" }).waitFor();
    assert.ok((await side.boundingBox())!.x >= 0);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("cmdpro-sidebar")!.getBoundingClientRect().right <= 0);
    await bottom.getByRole("button", { name: "Menu" }).click();
    await side.getByRole("link", { name: "Utilisateurs" }).click();
    await page.waitForURL(/\/utilisateurs$/);
    await page.waitForFunction(() => document.getElementById("cmdpro-sidebar")!.getBoundingClientRect().right <= 0); // se referme après navigation
  });

  await t.test("tablette : rail d'icônes, sans barre basse", async () => {
    const { page } = await session(VIEWPORTS[1]);
    await loginAs(page, ADMIN.u, ADMIN.p); await page.waitForURL(`${BASE}/`);
    assert.ok(!(await page.getByRole("navigation", { name: "Navigation rapide" }).isVisible()));
    const side = (await page.locator("#cmdpro-sidebar").boundingBox())!;
    assert.ok(side.x >= 0 && side.width <= 80, `rail de ${side.width}px`);
    await page.locator("#cmdpro-sidebar").getByRole("link", { name: "Personnel" }).click(); // libellé accessible même replié
    await page.waitForURL(/\/personnel$/);
  });

  await t.test("ordinateur : barre complète, repliable, choix mémorisé, recherche de module", async () => {
    const { page } = await session(VIEWPORTS[0]);
    await loginAs(page, ADMIN.u, ADMIN.p); await page.waitForURL(`${BASE}/`);
    const side = page.locator("#cmdpro-sidebar");
    assert.ok((await side.boundingBox())!.width >= 260);
    await side.getByPlaceholder("Rechercher un module").fill("journ");
    assert.equal(await side.getByRole("navigation").getByRole("link").count(), 1);
    await side.getByRole("link", { name: "Journal d'audit" }).click();
    await page.waitForURL(/journal/);
    await side.getByRole("button", { name: "Replier le menu" }).click();
    await page.waitForFunction(() => document.getElementById("cmdpro-sidebar")!.getBoundingClientRect().width <= 80); // après l'animation
    await page.reload();
    await page.waitForFunction(() => document.getElementById("cmdpro-sidebar")!.getBoundingClientRect().width <= 80);
    await side.getByRole("button", { name: "Déplier le menu" }).click();
    await page.waitForFunction(() => document.getElementById("cmdpro-sidebar")!.getBoundingClientRect().width >= 260);
  });
});

test("Composants : états et clavier", async (t) => {
  const { page, errors } = await session(VIEWPORTS[0]);
  await loginAs(page, ADMIN.u, ADMIN.p); await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/parametres/guide-visuel`);

  await t.test("boutons : désactivé non cliquable, chargement signalé, sélection annoncée", async () => {
    assert.ok(await page.getByRole("button", { name: "Désactivé" }).isDisabled());
    assert.equal(await page.getByRole("button", { name: /Chargement/ }).getAttribute("aria-busy"), "true");
    const sel = page.getByRole("button", { name: /Sélectionné/ });
    assert.equal(await sel.getAttribute("aria-pressed"), "true");
    await sel.click();
    assert.equal(await sel.getAttribute("aria-pressed"), "false");
  });

  await t.test("focus clavier visible", async () => {
    await page.getByRole("button", { name: "Principal" }).focus();
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    assert.notEqual(outline, "none");
  });

  await t.test("onglets au clavier", async () => {
    await page.getByRole("tab", { name: "Premier onglet" }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: /Deuxième/ }).getAttribute("aria-selected"), "true");
    await page.getByText("Contenu du deuxième onglet.").waitFor();
    await page.keyboard.press("End");
    assert.equal(await page.getByRole("tab", { name: "Troisième" }).getAttribute("aria-selected"), "true");
  });

  await t.test("fenêtre : ouverture, Échap, retour du focus", async () => {
    const opener = page.getByRole("button", { name: "Ouvrir une fenêtre" });
    await opener.click();
    const dlg = page.getByRole("dialog", { name: "Exemple de fenêtre" });
    await dlg.waitFor();
    assert.deepEqual(await axeViolations(page), []);
    await page.keyboard.press("Escape");
    await dlg.waitFor({ state: "hidden" });
    assert.ok(await opener.evaluate((el) => el === document.activeElement), "focus rendu au bouton");
  });

  await t.test("fenêtre sur téléphone : tient dans l'écran", async () => {
    const { page: m } = await session(VIEWPORTS[2]);
    await loginAs(m, ADMIN.u, ADMIN.p); await m.waitForURL(`${BASE}/`);
    await m.goto(`${BASE}/parametres/guide-visuel`);
    await m.getByRole("button", { name: "Ouvrir une fenêtre" }).click();
    const b = (await m.getByRole("dialog").boundingBox())!;
    assert.ok(b.x >= 0 && b.x + b.width <= 390 && b.y >= 0 && b.y + b.height <= 844, JSON.stringify(b));
    await m.screenshot({ path: path.join(SHOTS, "p4-telephone-fenetre.png") });
  });

  await t.test("notifications : annoncées et fermables", async () => {
    await page.getByRole("button", { name: "Afficher une notification" }).click();
    const s = page.getByRole("status").filter({ hasText: "Exemple de notification de réussite." });
    await s.waitFor();
    await s.getByRole("button", { name: "Fermer le message" }).click();
    await s.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Notification d'erreur" }).click();
    await page.getByRole("alert").filter({ hasText: "Exemple de notification d'erreur." }).waitFor();
  });

  await t.test("aucune erreur dans la console", () => assert.deepEqual(errors, []));
});
