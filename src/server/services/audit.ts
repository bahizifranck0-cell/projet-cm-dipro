import type { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import type { Actor } from "../auth/actor";

export type AuditInput = {
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
};

/** Écrit une ligne dans le journal d'audit (table en ajout seul). */
export async function audit(actor: Pick<Actor, "userId" | "ip"> | null, input: AuditInput, tx: Tx = db) {
  await tx.auditLog.create({
    data: { ...input, userId: actor?.userId ?? null, ip: actor?.ip ?? null },
  });
}

export async function listAudit(opts: { userId?: string; module?: string; take?: number; cursor?: bigint }) {
  return db.auditLog.findMany({
    where: { userId: opts.userId, module: opts.module },
    orderBy: { id: "desc" },
    take: opts.take ?? 50,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { user: { select: { username: true, employee: { select: { firstName: true, lastName: true } } } } },
  });
}
