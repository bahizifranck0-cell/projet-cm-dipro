import { z } from "zod";
import { db } from "../db";
import { assertCan, ValidationError, type Actor } from "../auth/actor";
import { audit } from "./audit";
import { parse, req, toCode } from "./validation";

export const listDepartments = (activeOnly = false) =>
  db.department.findMany({ where: activeOnly ? { active: true } : {}, orderBy: { name: "asc" }, include: { _count: { select: { employees: true, users: true } } } });

const input = z.object({ name: req("Le nom du département", 80) });

export async function createDepartment(actor: Actor, raw: unknown) {
  assertCan(actor, "settings", "update");
  const { name } = parse(input, raw);
  const code = toCode(name);
  if (await db.department.findFirst({ where: { OR: [{ code }, { name: { equals: name, mode: "insensitive" } }] } }))
    throw new ValidationError("Ce département existe déjà.", "name");
  const d = await db.department.create({ data: { code, name } });
  await audit(actor, { action: "CREATE", module: "settings", entityType: "Department", entityId: d.id, details: { name } });
  return d;
}

export async function renameDepartment(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "settings", "update");
  const { name } = parse(input, raw);
  if (await db.department.findFirst({ where: { id: { not: id }, name: { equals: name, mode: "insensitive" } } }))
    throw new ValidationError("Ce département existe déjà.", "name");
  const before = await db.department.findUniqueOrThrow({ where: { id } });
  await db.department.update({ where: { id }, data: { name } });
  await audit(actor, { action: "UPDATE", module: "settings", entityType: "Department", entityId: id, details: { before: before.name, after: name } });
}

export async function setDepartmentActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "settings", "update");
  await db.department.update({ where: { id }, data: { active } });
  await audit(actor, { action: active ? "ACTIVATE" : "DEACTIVATE", module: "settings", entityType: "Department", entityId: id });
}
