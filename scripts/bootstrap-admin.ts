// Crée le premier Super Administrateur à partir des variables CMDPRO_ADMIN_USERNAME / CMDPRO_ADMIN_PASSWORD,
// UNIQUEMENT si aucun Super Administrateur n'existe. Mot de passe provisoire : changement obligatoire à la 1re connexion.
import { db } from "../src/server/db";
import { hashPassword, passwordProblem } from "../src/server/auth/password";

async function main() {
  if (await db.user.count({ where: { isSuperAdmin: true } })) { console.log("Super Administrateur déjà présent : rien à faire."); return; }
  const username = process.env.CMDPRO_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.CMDPRO_ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Aucun Super Administrateur n'existe encore : ajoutez CMDPRO_ADMIN_USERNAME et CMDPRO_ADMIN_PASSWORD (10 caractères minimum, lettres et chiffres) dans Vercel → Settings → Environment Variables, puis relancez le déploiement.");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const role = await db.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  const u = await db.user.create({ data: { username, passwordHash: await hashPassword(password), roleId: role.id, isSuperAdmin: true, mustChangePassword: true } });
  await db.auditLog.create({ data: { action: "CREATE_SUPER_ADMIN", module: "users", entityType: "User", entityId: u.id, details: { username, via: "deploiement" } } });
  console.log(`Super Administrateur « ${username} » créé (mot de passe provisoire à changer).`);
}
main().then(() => db.$disconnect(), async (e) => { console.error(e.message); await db.$disconnect(); process.exit(1); });
