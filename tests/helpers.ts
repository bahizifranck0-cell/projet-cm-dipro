import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { login } from "../src/server/services/auth";
import { actorFromToken } from "../src/server/services/sessions";
import { seed } from "../scripts/seed";

export const PASSWORD = "MotDePasse2026";

export async function freshSeed() {
  if (!/_test$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Base de test requise");
  await seed(() => {});
}

let n = 0;
/** Crée un employé fictif + compte avec le rôle donné et renvoie l'acteur connecté. */
export async function actorWithRole(roleCode: string, opts: { superAdmin?: boolean } = {}) {
  const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
  const k = `${Date.now().toString(36)}${n++}`;
  const emp = await db.employee.create({ data: { matricule: `T-${k}`, firstName: "Test", lastName: `${roleCode}-${k}`, position: "TEST" } });
  const user = await db.user.create({
    data: { username: `t${k}`, passwordHash: await hashPassword(PASSWORD), roleId: role.id, employeeId: emp.id, isSuperAdmin: !!opts.superAdmin, mustChangePassword: false },
  });
  const r = await login(user.username, PASSWORD);
  if (!r.ok) throw new Error(r.error);
  const actor = await actorFromToken(r.token);
  return { actor: actor!, user, emp, token: r.token };
}
