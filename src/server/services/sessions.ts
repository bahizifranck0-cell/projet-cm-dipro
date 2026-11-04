import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { permissionKey } from "../auth/permissions";

export const SESSION_HOURS = 12; // une garde

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600e3);
  const s = await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
  });
  return { token, expiresAt, sessionId: s.id };
}

/**
 * Retrouve l'utilisateur d'une session. Vérifié à chaque requête :
 * session valide, compte actif, rôle actif. Sinon : aucun accès.
 */
export async function actorFromToken(token: string | undefined, ip?: string | null): Promise<Actor | null> {
  if (!token) return null;
  const s = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          employee: { select: { firstName: true, lastName: true } },
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  if (!s || !s.user || s.revokedAt || s.expiresAt < new Date()) return null;
  const u = s.user;
  if (u.status !== "ACTIVE") return null;

  // Prolonge une session active à mi-parcours.
  const remaining = s.expiresAt.getTime() - Date.now();
  if (remaining < (SESSION_HOURS * 3600e3) / 2) {
    await db.session.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() + SESSION_HOURS * 3600e3) } });
  }

  const permissions = u.role.active
    ? new Set(u.role.permissions.map((rp) => permissionKey(rp.permission.module, rp.permission.action)))
    : new Set<string>();

  return {
    userId: u.id,
    username: u.username,
    isSuperAdmin: u.isSuperAdmin,
    roleId: u.roleId,
    roleName: u.role.name,
    departmentId: u.departmentId,
    employeeId: u.employeeId,
    displayName: u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username,
    permissions,
    sessionId: s.id,
    mustChangePassword: u.mustChangePassword,
    ip: ip ?? null,
  };
}

export async function revokeSession(token: string) {
  await db.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllUserSessions(userId: string, exceptSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}
