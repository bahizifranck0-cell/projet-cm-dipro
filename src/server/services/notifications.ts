import { db, type Tx } from "../db";
import { permissionKey, type Action, type ModuleKey } from "../auth/permissions";
import type { Actor } from "../auth/actor";

type NotifyInput = {
  module: string; type: string; title: string; body?: string;
  entityType?: string; entityId?: string; link?: string;
  /** Évite de notifier deux fois la même chose (ex. "lab:<id>:new") */
  dedupeKey?: string;
};

/** Utilisateurs actifs disposant d'une permission (Super Administrateurs inclus). */
export async function usersWithPermission(module: ModuleKey, action: Action, tx: Tx = db) {
  const users = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ isSuperAdmin: true }, { role: { active: true, permissions: { some: { permission: { module, action } } } } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Envoie une notification aux seuls destinataires concernés ; jamais en double (dedupeKey). */
export async function notify(recipients: string[], n: NotifyInput, tx: Tx = db, exceptUserId?: string) {
  const ids = [...new Set(recipients)].filter((id) => id !== exceptUserId);
  if (!ids.length) return 0;
  const r = await tx.notification.createMany({
    data: ids.map((recipientUserId) => ({ recipientUserId, ...n, dedupeKey: n.dedupeKey ?? null })),
    skipDuplicates: true,
  });
  return r.count;
}

export async function notifyPermission(module: ModuleKey, action: Action, n: NotifyInput, tx: Tx = db, exceptUserId?: string) {
  return notify(await usersWithPermission(module, action, tx), n, tx, exceptUserId);
}

/** Utilisateur lié à un employé (ex. médecin demandeur). */
export async function userOfEmployee(employeeId: string | null | undefined, tx: Tx = db) {
  if (!employeeId) return null;
  return (await tx.user.findFirst({ where: { employeeId, status: "ACTIVE" }, select: { id: true } }))?.id ?? null;
}

export async function listNotifications(actor: Actor, opts: { unreadOnly?: boolean; take?: number } = {}) {
  return db.notification.findMany({
    where: { recipientUserId: actor.userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" }, take: opts.take ?? 100,
  });
}

/** Compteurs par module : éléments non lus (chaque élément compté une seule fois). */
export async function unreadCounts(actor: Actor): Promise<Record<string, number>> {
  const rows = await db.notification.groupBy({ by: ["module"], where: { recipientUserId: actor.userId, readAt: null }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.module, r._count._all]));
}

export async function markRead(actor: Actor, ids: string[] | "all", module?: string) {
  await db.notification.updateMany({
    where: { recipientUserId: actor.userId, readAt: null, ...(ids === "all" ? (module ? { module } : {}) : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

/** Marque comme lues les notifications d'un élément consulté (ex. ouverture d'une demande). */
export async function markEntityRead(actor: Actor, entityType: string, entityId: string) {
  await db.notification.updateMany({ where: { recipientUserId: actor.userId, entityType, entityId, readAt: null }, data: { readAt: new Date() } });
}

export { permissionKey };
