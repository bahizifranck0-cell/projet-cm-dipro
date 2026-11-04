import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { actorFromToken } from "../services/sessions";
import { can, ForbiddenError, type Actor } from "./actor";
import type { Action, ModuleKey } from "./permissions";

export const SESSION_COOKIE = "cmdpro_session";

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}

/** Utilisateur de la requête en cours (vérifié en base à chaque requête). */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return actorFromToken(token, await clientIp());
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/connexion");
  return actor;
}

/** Pour les pages : redirige vers la page « accès refusé » si la permission manque. */
export async function requirePage(module: ModuleKey, action: Action = "view"): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, module, action)) redirect("/acces-refuse");
  return actor;
}

export async function requireSuperAdminPage(): Promise<Actor> {
  const actor = await requireActor();
  if (!actor.isSuperAdmin) redirect("/acces-refuse");
  return actor;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Pour les actions serveur : session valide obligatoire, et aucun droit
 * tant que le mot de passe provisoire n'a pas été changé.
 */
export async function actionActor(opts: { allowPasswordChange?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new ForbiddenError("Votre session a expiré. Reconnectez-vous.");
  if (actor.mustChangePassword && !opts.allowPasswordChange) throw new ForbiddenError("Changez d'abord votre mot de passe provisoire.");
  return actor;
}
