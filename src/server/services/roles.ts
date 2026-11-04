import { z } from "zod";
import { db } from "../db";
import { assertSuperAdmin, ValidationError, type Actor } from "../auth/actor";
import { ALL_PERMISSION_KEYS, isKnownPermission, permissionKey } from "../auth/permissions";
import { audit } from "./audit";
import { opt, parse, req, toCode } from "./validation";

export async function listRoles() {
  return db.role.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true, permissions: true } } },
  });
}

export async function getRole(id: string) {
  const role = await db.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } });
  if (!role) return null;
  return { ...role, permissionKeys: role.permissions.map((rp) => permissionKey(rp.permission.module, rp.permission.action)) };
}

const roleInput = z.object({ name: req("Le nom du rôle", 60), description: opt(300) });

export async function createRole(actor: Actor, input: unknown) {
  assertSuperAdmin(actor);
  const { name, description } = parse(roleInput, input);
  const code = toCode(name);
  if (!code) throw new ValidationError("Nom de rôle invalide.", "name");
  if (await db.role.findFirst({ where: { OR: [{ code }, { name: { equals: name, mode: "insensitive" } }] } }))
    throw new ValidationError("Un rôle portant ce nom existe déjà.", "name");
  const role = await db.role.create({ data: { code, name, description } });
  await audit(actor, { action: "CREATE", module: "roles", entityType: "Role", entityId: role.id, details: { name } });
  return role;
}

export async function updateRole(actor: Actor, id: string, input: unknown) {
  assertSuperAdmin(actor);
  const { name, description } = parse(roleInput, input);
  const before = await db.role.findUniqueOrThrow({ where: { id } });
  const clash = await db.role.findFirst({ where: { id: { not: id }, name: { equals: name, mode: "insensitive" } } });
  if (clash) throw new ValidationError("Un rôle portant ce nom existe déjà.", "name");
  const role = await db.role.update({ where: { id }, data: { name, description: description ?? null } });
  await audit(actor, { action: "UPDATE", module: "roles", entityType: "Role", entityId: id, details: { before: { name: before.name }, after: { name } } });
  return role;
}

/** Remplace toutes les permissions d'un rôle par celles cochées. */
export async function setRolePermissions(actor: Actor, roleId: string, keys: string[]) {
  assertSuperAdmin(actor);
  const unique = [...new Set(keys)];
  const unknown = unique.filter((k) => !isKnownPermission(k));
  if (unknown.length) throw new ValidationError(`Permission inconnue : ${unknown.join(", ")}`);
  const role = await db.role.findUniqueOrThrow({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  const before = role.permissions.map((rp) => permissionKey(rp.permission.module, rp.permission.action));

  const perms = await db.permission.findMany();
  const idByKey = new Map(perms.map((p) => [permissionKey(p.module, p.action), p.id]));
  const missing = unique.filter((k) => !idByKey.has(k));
  if (missing.length) throw new ValidationError("Catalogue de permissions non synchronisé : lancez « npm run db:seed ».");

  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (unique.length) await tx.rolePermission.createMany({ data: unique.map((k) => ({ roleId, permissionId: idByKey.get(k)! })) });
    await audit(actor, {
      action: "PERMISSIONS_UPDATE", module: "roles", entityType: "Role", entityId: roleId,
      details: { added: unique.filter((k) => !before.includes(k)), removed: before.filter((k) => !unique.includes(k)) },
    }, tx);
  });
}

/** Supprime si aucun utilisateur et non système ; sinon on doit désactiver. */
export async function deleteRole(actor: Actor, id: string) {
  assertSuperAdmin(actor);
  const role = await db.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
  if (role.isSystem) throw new ValidationError("Un rôle système ne peut pas être supprimé. Vous pouvez le désactiver.");
  if (role._count.users > 0) throw new ValidationError("Ce rôle est attribué à des utilisateurs : désactivez-le plutôt que de le supprimer.");
  await db.role.delete({ where: { id } });
  await audit(actor, { action: "DELETE", module: "roles", entityType: "Role", entityId: id, details: { name: role.name } });
}

export async function setRoleActive(actor: Actor, id: string, active: boolean) {
  assertSuperAdmin(actor);
  const role = await db.role.findUniqueOrThrow({ where: { id } });
  if (role.code === "SUPER_ADMIN" && !active) throw new ValidationError("Le rôle Super Administrateur ne peut pas être désactivé.");
  await db.role.update({ where: { id }, data: { active } });
  await audit(actor, { action: active ? "ACTIVATE" : "DEACTIVATE", module: "roles", entityType: "Role", entityId: id, details: { name: role.name } });
}

export { ALL_PERMISSION_KEYS };
