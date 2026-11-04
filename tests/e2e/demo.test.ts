// Mode démonstration : instance séparée (CMDPRO_DEMO=1, base « demo »).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";

const PORT = 3200, BASE = `http://localhost:${PORT}`;
let server: ChildProcess, browser: Browser;
before(async () => {
  if (!process.env.DEMO_DATABASE_URL) throw new Error("DEMO_DATABASE_URL requis");
  server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore", detached: true, env: { ...process.env, DATABASE_URL: process.env.DEMO_DATABASE_URL, CMDPRO_DEMO: "1" } });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/connexion`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); if (server?.pid) try { process.kill(-server.pid, "SIGTERM"); } catch {} });

test("connexion de démonstration en un clic, données marquées fictives", async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`${BASE}/connexion`);
  await p.getByRole("heading", { name: "Démonstration — données fictives" }).waitFor();
  for (const r of ["Médecin dentiste", "Caissier", "Responsable laboratoire"]) await p.getByText(r).waitFor();
  await p.getByRole("button", { name: /Finance \/ Comptabilité/ }).click();
  await p.waitForURL(`${BASE}/`);
  await p.getByText("Démonstration : toutes les données sont fictives.").waitFor();
  await p.goto(`${BASE}/finance`);
  await p.getByText(/Encaissement REC-/).first().waitFor();
  assert.ok(true);
});
