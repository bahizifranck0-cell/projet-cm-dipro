import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "playwright";

export const PORT = 3100;
export const BASE = `http://localhost:${PORT}`;
export const ADMIN = { u: process.env.E2E_ADMIN_USER ?? "superadmin", p: process.env.E2E_ADMIN_PASS ?? "AdminTest2026" };

/** Démarre le serveur de production dans son propre groupe de processus. */
export async function startServer(): Promise<ChildProcess> {
  try { await fetch(`${BASE}/connexion`); throw new Error(`Le port ${PORT} est déjà occupé : arrêtez l'ancien serveur.`); }
  catch (e) { if ((e as Error).message.includes("déjà occupé")) throw e; }
  const server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore", env: process.env, detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/connexion`)).ok) return server; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Le serveur ne répond pas");
}
export function stopServer(server?: ChildProcess) {
  if (server?.pid) try { process.kill(-server.pid, "SIGTERM"); } catch {}
}

export async function loginAs(page: Page, u: string, p: string) {
  await page.goto(`${BASE}/connexion`);
  await page.getByLabel("Identifiant").fill(u);
  await page.getByLabel("Mot de passe", { exact: true }).fill(p);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
/** Audit d'accessibilité WCAG 2.1 A/AA (contraste, libellés, rôles, clavier…). */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    // @ts-expect-error axe injecté
    const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
    return r.violations.map((v: { id: string; nodes: { target: string[]; failureSummary: string }[] }) =>
      `${v.id} : ${v.nodes.slice(0, 2).map((n) => `${n.target.join(" ")} → ${n.failureSummary.split("\n")[1]?.trim()}`).join(" | ")}`);
  });
}
export const overflowPx = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
