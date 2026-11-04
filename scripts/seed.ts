// Initialisation SANS données fictives : catalogue de permissions, rôles du cahier des charges,
// moyen de paiement « Espèces ». Peut être relancé sans risque (n'écrase rien).
import { db } from "../src/server/db";
import { MODULES, ACTION_LABELS } from "../src/server/auth/permissions";
import { DEFAULT_ROLES } from "../src/server/auth/default-roles";

export async function seed(log = console.log) {
  let created = 0;
  for (const m of MODULES) {
    for (const a of m.actions) {
      const r = await db.permission.upsert({
        where: { module_action: { module: m.key, action: a } },
        create: { module: m.key, action: a, label: `${m.label} — ${ACTION_LABELS[a]}` },
        update: { label: `${m.label} — ${ACTION_LABELS[a]}` },
      });
      if (r) created++;
    }
  }
  log(`Permissions synchronisées : ${created}`);

  await db.role.upsert({
    where: { code: "SUPER_ADMIN" },
    create: { code: "SUPER_ADMIN", name: "Super Administrateur", description: "Responsable technique et fonctionnel : accès complet.", isSystem: true },
    update: {},
  });

  const perms = await db.permission.findMany();
  const idOf = (m: string, a: string) => perms.find((p) => p.module === m && p.action === a)?.id;
  for (const r of DEFAULT_ROLES) {
    const exists = await db.role.findUnique({ where: { code: r.code } });
    if (exists) continue; // ne jamais écraser les réglages de l'administrateur
    const permissionIds = Object.entries(r.grants).flatMap(([m, acts]) => acts.map((a) => idOf(m, a)).filter(Boolean) as string[]);
    await db.role.create({
      data: { code: r.code, name: r.name, description: r.description, isSystem: true, permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) } },
    });
    log(`Rôle créé : ${r.name}`);
  }

  await db.paymentMethod.upsert({ where: { code: "CASH" }, create: { code: "CASH", name: "Espèces" }, update: {} });
  log("Initialisation terminée.");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
}
