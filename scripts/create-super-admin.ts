// Crée le premier Super Administrateur (aucun mot de passe par défaut n'existe).
// Usage : npm run admin:create      (questions interactives)
//    ou : CMDPRO_ADMIN_USERNAME=... CMDPRO_ADMIN_PASSWORD=... npm run admin:create
import { createInterface } from "node:readline/promises";
import { db } from "../src/server/db";
import { hashPassword, passwordProblem } from "../src/server/auth/password";
import { seed } from "./seed";

async function main() {
  await seed(() => {});
  let username = process.env.CMDPRO_ADMIN_USERNAME;
  let password = process.env.CMDPRO_ADMIN_PASSWORD;
  if (!username || !password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    username ||= await rl.question("Identifiant du Super Administrateur : ");
    password ||= await rl.question("Mot de passe (10 caractères min., lettres et chiffres) : ");
    rl.close();
  }
  username = username.trim().toLowerCase();
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if (await db.user.findUnique({ where: { username } })) throw new Error("Cet identifiant existe déjà.");
  const role = await db.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  const user = await db.user.create({
    data: { username, passwordHash: await hashPassword(password), roleId: role.id, isSuperAdmin: true, mustChangePassword: false },
  });
  await db.auditLog.create({ data: { action: "CREATE_SUPER_ADMIN", module: "users", entityType: "User", entityId: user.id, details: { username, via: "cli" } } });
  console.log(`Super Administrateur « ${username} » créé.`);
}

main().then(() => db.$disconnect(), async (e) => { console.error("Erreur :", e.message); await db.$disconnect(); process.exit(1); });
