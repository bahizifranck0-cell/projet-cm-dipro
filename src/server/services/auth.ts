import { db } from "../db";
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { ValidationError, type Actor } from "../auth/actor";
import { audit } from "./audit";
import { createSession, revokeAllUserSessions } from "./sessions";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; mustChangePassword: boolean }
  | { ok: false; error: string };

const GENERIC = "Identifiant ou mot de passe incorrect.";

export async function login(
  usernameRaw: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<LoginResult> {
  const username = usernameRaw.trim().toLowerCase();
  if (!username || !password) return { ok: false, error: "Saisissez votre identifiant et votre mot de passe." };

  // Blocage temporaire après plusieurs échecs (par identifiant).
  const since = new Date(Date.now() - LOCK_MINUTES * 60e3);
  const recentFailures = await db.auditLog.count({
    where: { action: "LOGIN_FAILED", module: "auth", entityId: username, at: { gte: since } },
  });
  if (recentFailures >= MAX_FAILED_LOGINS) {
    await audit(null, { action: "LOGIN_BLOCKED", module: "auth", entityType: "username", entityId: username, details: { ip: meta.ip ?? null } });
    return { ok: false, error: `Trop de tentatives. Réessayez dans ${LOCK_MINUTES} minutes ou contactez l'administrateur.` };
  }

  const user = await db.user.findUnique({ where: { username } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : (await dummyVerify(password), false);

  if (!user || !valid) {
    await audit(user ? { userId: user.id, ip: meta.ip } : null, {
      action: "LOGIN_FAILED", module: "auth", entityType: "username", entityId: username, details: { ip: meta.ip ?? null },
    });
    return { ok: false, error: GENERIC };
  }
  if (user.status !== "ACTIVE") {
    await audit({ userId: user.id, ip: meta.ip }, { action: "LOGIN_REFUSED_DISABLED", module: "auth", entityType: "User", entityId: user.id });
    return { ok: false, error: "Ce compte est désactivé. Contactez l'administrateur." };
  }

  const s = await createSession(user.id, meta);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, ip: meta.ip }, { action: "LOGIN", module: "auth", entityType: "Session", entityId: s.sessionId, details: { userAgent: meta.userAgent?.slice(0, 200) ?? null } });
  return { ok: true, token: s.token, expiresAt: s.expiresAt, mustChangePassword: user.mustChangePassword };
}

export async function logout(actor: Actor) {
  if (actor.sessionId) await db.session.update({ where: { id: actor.sessionId }, data: { revokedAt: new Date() } });
  await audit(actor, { action: "LOGOUT", module: "auth", entityType: "Session", entityId: actor.sessionId });
}

export async function changeOwnPassword(actor: Actor, current: string, next: string, confirm: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new ValidationError("Mot de passe actuel incorrect.", "current");
  if (next !== confirm) throw new ValidationError("Les deux nouveaux mots de passe ne correspondent pas.", "confirm");
  if (next === current) throw new ValidationError("Le nouveau mot de passe doit être différent de l'ancien.", "next");
  const problem = passwordProblem(next);
  if (problem) throw new ValidationError(problem, "next");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await revokeAllUserSessions(user.id, actor.sessionId); // déconnecte les autres appareils
  await audit(actor, { action: "PASSWORD_CHANGED", module: "auth", entityType: "User", entityId: user.id });
}
