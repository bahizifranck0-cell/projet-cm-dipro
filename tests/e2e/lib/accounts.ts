import type { Browser, Page } from "playwright";
import { db } from "../../../src/server/db";
import { hashPassword } from "../../../src/server/auth/password";
import { BASE, loginAs } from "./server";

export const PW = "MotDePasse2026";
export type Acc = { username: string; empId: string; userId: string; last: string };

/** Compte de test (employé + utilisateur) avec le rôle demandé. */
export async function account(tag: string, role: string, first: string, last: string): Promise<Acc> {
  const r = await db.role.findUniqueOrThrow({ where: { code: role } });
  const e = await db.employee.create({ data: { matricule: `E-${tag}-${role}`, firstName: first, lastName: `${last}${tag}`, position: r.name } });
  const u = await db.user.create({ data: { username: `${tag}.${role.toLowerCase()}`, passwordHash: await hashPassword(PW), roleId: r.id, employeeId: e.id, mustChangePassword: false } });
  return { username: u.username, empId: e.id, userId: u.id, last: `${last}${tag}`.toUpperCase() };
}

export async function openAs(browser: Browser, errors: string[], username: string, password = PW, vp = { width: 1366, height: 900 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport: vp, locale: "fr-FR" })).newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} : ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${page.url()} : ${e.message}`));
  await loginAs(page, username, password); await page.waitForURL(`${BASE}/`);
  return page;
}
