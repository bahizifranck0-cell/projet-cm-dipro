import { z } from "zod";
import { db } from "../db";
import { assertSuperAdmin, ValidationError, type Actor } from "../auth/actor";
import { hashPassword, passwordProblem } from "../auth/password";
import { audit } from "./audit";
import { revokeAllUserSessions } from "./sessions";
import { opt, parse, req } from "./validation";

const usernameSchema = req("L'identifiant", 40)
  .transform((v) => v.toLowerCase())
  .refine((v) => /^[a-z0-9._-]{3,40}$/.test(v), "L'identifiant : 3 à 40 caractères (lettres, chiffres, . _ -).");

const createInput = z.object({
  employeeId: req("L'employé", 40),
  username: usernameSchema,
  password: z.string().min(1, "Le mot de passe est obligatoire."),
  roleId: req("Le rôle", 40),
  departmentId: opt(40),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
});

export async function listUsers(actor: Actor) {
  assertSuperAdmin(actor);
  return db.user.findMany({
    orderBy: [{ status: "asc" }, { username: "asc" }],
    include: { role: true, department: true, employee: true },
  });
}

export async function getUserDetail(actor: Actor, id: string) {
  assertSuperAdmin(actor);
  const user = await db.user.findUnique({ where: { id }, include: { role: true, department: true, employee: { include: { department: true } } } });
  if (!user) return null;
  const [logins, actions, counts] = await Promise.all([
    db.auditLog.findMany({ where: { userId: id, module: "auth" }, orderBy: { id: "desc" }, take: 30 }),
    db.auditLog.findMany({ where: { userId: id, NOT: { module: "auth" } }, orderBy: { id: "desc" }, take: 100 }),
    db.auditLog.groupBy({ by: ["module"], where: { userId: id }, _count: { _all: true } }),
  ]);
  return { user, logins, actions, modules: counts.map((c) => ({ module: c.module, count: c._count._all })).sort((a, b) => b.count - a.count) };
}

export async function createUser(actor: Actor, raw: unknown) {
  assertSuperAdmin(actor);
  const data = parse(createInput, raw);
  const problem = passwordProblem(data.password);
  if (problem) throw new ValidationError(problem, "password");

  const emp = await db.employee.findUnique({ where: { id: data.employeeId }, include: { user: true } });
  if (!emp) throw new ValidationError("Employé introuvable.", "employeeId");
  if (emp.user) throw new ValidationError("Cet employé possède déjà un compte.", "employeeId");
  if (await db.user.findUnique({ where: { username: data.username } })) throw new ValidationError("Cet identifiant est déjà pris.", "username");
  const role = await db.role.findUnique({ where: { id: data.roleId } });
  if (!role || !role.active) throw new ValidationError("Rôle introuvable ou désactivé.", "roleId");
  if (role.code === "SUPER_ADMIN") throw new ValidationError("Le rôle Super Administrateur ne s'attribue pas depuis ce formulaire.", "roleId");

  const user = await db.user.create({
    data: {
      username: data.username,
      passwordHash: await hashPassword(data.password),
      employeeId: emp.id,
      roleId: role.id,
      departmentId: data.departmentId ?? emp.departmentId,
      status: data.status,
      mustChangePassword: true,
    },
  });
  await audit(actor, { action: "CREATE", module: "users", entityType: "User", entityId: user.id, details: { username: user.username, role: role.name, employee: emp.matricule } });
  return user;
}

const updateInput = z.object({ roleId: req("Le rôle", 40), departmentId: opt(40) });

export async function updateUserAssignment(actor: Actor, id: string, raw: unknown) {
  assertSuperAdmin(actor);
  const data = parse(updateInput, raw);
  const before = await db.user.findUniqueOrThrow({ where: { id }, include: { role: true } });
  const role = await db.role.findUnique({ where: { id: data.roleId } });
  if (!role || !role.active) throw new ValidationError("Rôle introuvable ou désactivé.", "roleId");
  if (role.code === "SUPER_ADMIN" && !before.isSuperAdmin) throw new ValidationError("Le rôle Super Administrateur ne s'attribue pas depuis ce formulaire.", "roleId");
  if (before.isSuperAdmin && role.code !== "SUPER_ADMIN") throw new ValidationError("Le rôle d'un Super Administrateur ne peut pas être changé ici.", "roleId");
  await db.user.update({ where: { id }, data: { roleId: role.id, departmentId: data.departmentId ?? null } });
  await audit(actor, { action: "UPDATE", module: "users", entityType: "User", entityId: id, details: { role: { before: before.role.name, after: role.name }, departmentId: data.departmentId ?? null } });
}

export async function setUserStatus(actor: Actor, id: string, status: "ACTIVE" | "DISABLED") {
  assertSuperAdmin(actor);
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  if (status === "DISABLED") {
    if (id === actor.userId) throw new ValidationError("Vous ne pouvez pas désactiver votre propre compte.");
    if (user.isSuperAdmin) {
      const others = await db.user.count({ where: { isSuperAdmin: true, status: "ACTIVE", id: { not: id } } });
      if (others === 0) throw new ValidationError("Impossible de désactiver le dernier Super Administrateur actif.");
    }
  }
  await db.user.update({ where: { id }, data: { status } });
  if (status === "DISABLED") await revokeAllUserSessions(id); // déconnexion immédiate
  await audit(actor, { action: status === "DISABLED" ? "DEACTIVATE" : "ACTIVATE", module: "users", entityType: "User", entityId: id, details: { username: user.username } });
}

export async function resetUserPassword(actor: Actor, id: string, password: string) {
  assertSuperAdmin(actor);
  const problem = passwordProblem(password);
  if (problem) throw new ValidationError(problem, "password");
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } });
  await revokeAllUserSessions(id);
  await audit(actor, { action: "PASSWORD_RESET", module: "users", entityType: "User", entityId: id });
}
