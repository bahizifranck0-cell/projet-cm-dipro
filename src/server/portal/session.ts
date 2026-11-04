import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { portalSessionFromToken } from "../services/portal";

export const PORTAL_COOKIE = "cmdpro_portal";
export const getPortalSession = cache(async () => portalSessionFromToken((await cookies()).get(PORTAL_COOKIE)?.value));
export async function requirePortal(allowPasswordChange = false) {
  const s = await getPortalSession();
  if (!s) redirect("/portail/connexion");
  if (s.mustChangePassword && !allowPasswordChange) redirect("/portail/mot-de-passe");
  return s;
}
export async function setPortalCookie(token: string, expiresAt: Date) {
  (await cookies()).set(PORTAL_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/portail", expires: expiresAt, secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production" });
}
export async function clearPortalCookie() { (await cookies()).delete({ name: PORTAL_COOKIE, path: "/portail" }); }
export async function portalIp() { const h = await headers(); return h.get("x-forwarded-for")?.split(",")[0].trim() ?? null; }
