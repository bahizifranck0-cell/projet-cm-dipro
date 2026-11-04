import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError, ValidationError } from "../../src/server/auth/actor";
import { login, changeOwnPassword, MAX_FAILED_LOGINS } from "../../src/server/services/auth";
import { actorFromToken } from "../../src/server/services/sessions";
import * as roles from "../../src/server/services/roles";
import * as users from "../../src/server/services/users";
import * as employees from "../../src/server/services/employees";
import * as departments from "../../src/server/services/departments";
import { actorWithRole, freshSeed, PASSWORD } from "../helpers";

let admin: Awaited<ReturnType<typeof actorWithRole>>;
before(async () => { await freshSeed(); admin = await actorWithRole("SUPER_ADMIN", { superAdmin: true }); });
after(() => db.$disconnect());

test("seed : 12 rôles du cahier des charges + Super Administrateur, relançable sans doublon", async () => {
  await freshSeed();
  assert.equal(await db.role.count(), 13);
  assert.equal(await db.paymentMethod.count(), 1);
});

test("connexion : succès journalisé, mauvais mot de passe refusé avec message générique", async () => {
  const bad = await login(admin.user.username, "faux");
  assert.deepEqual(bad, { ok: false, error: "Identifiant ou mot de passe incorrect." });
  const unknown = await login("inconnu", "faux");
  assert.equal(unknown.ok, false);
  const ok = await login(admin.user.username.toUpperCase(), PASSWORD);
  assert.ok(ok.ok);
  assert.ok(await db.auditLog.count({ where: { userId: admin.user.id, action: "LOGIN" } }) >= 1);
  assert.ok(await db.auditLog.count({ where: { userId: admin.user.id, action: "LOGIN_FAILED" } }) >= 1);
});

test("blocage après plusieurs échecs, même avec le bon mot de passe", async () => {
  const { user } = await actorWithRole("CAISSIER");
  for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login(user.username, "mauvais");
  const r = await login(user.username, PASSWORD);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /Trop de tentatives/);
});

test("permissions appliquées côté serveur : un caissier ne gère ni rôles, ni utilisateurs, ni personnel", async () => {
  const { actor } = await actorWithRole("CAISSIER");
  await assert.rejects(roles.createRole(actor, { name: "Pirate" }), ForbiddenError);
  await assert.rejects(users.listUsers(actor), ForbiddenError);
  await assert.rejects(employees.createEmployee(actor, { firstName: "A", lastName: "B", position: "C" }), ForbiddenError);
  await assert.rejects(departments.createDepartment(actor, { name: "X" }), ForbiddenError);
  assert.ok(actor.permissions.has("cash.create"));
  assert.ok(!actor.permissions.has("credit.validate"));
});

test("matrice : cocher une permission la donne immédiatement, la décocher la retire", async () => {
  const role = await roles.createRole(admin.actor, { name: `Rôle test ${Date.now()}`, description: "TEST" });
  await assert.rejects(roles.setRolePermissions(admin.actor, role.id, ["inexistant.view"]), ValidationError);
  await roles.setRolePermissions(admin.actor, role.id, ["hr.view", "hr.create", "settings.update"]);

  const emp = await employees.createEmployee(admin.actor, { firstName: "Agent", lastName: "TEST", position: "RH" });
  await users.createUser(admin.actor, { employeeId: emp.id, username: `agent${Date.now()}`, password: PASSWORD, roleId: role.id });
  const u = await db.user.findFirstOrThrow({ where: { employeeId: emp.id } });
  const r = await login(u.username, PASSWORD);
  assert.ok(r.ok);
  const token = (r as { token: string }).token;

  let actor = (await actorFromToken(token))!;
  await departments.createDepartment(actor, { name: `Service TEST ${Date.now()}` }); // autorisé
  await roles.setRolePermissions(admin.actor, role.id, ["hr.view"]);
  actor = (await actorFromToken(token))!; // relu à chaque requête
  await assert.rejects(departments.createDepartment(actor, { name: "Refusé" }), ForbiddenError);

  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: role.id, action: "PERMISSIONS_UPDATE" }, orderBy: { id: "desc" } });
  assert.deepEqual((log.details as { removed: string[] }).removed.sort(), ["hr.create", "settings.update"]);

  await roles.setRoleActive(admin.actor, role.id, false); // rôle désactivé = plus aucune permission
  actor = (await actorFromToken(token))!;
  assert.equal(actor.permissions.size, 0);
  await assert.rejects(roles.deleteRole(admin.actor, role.id), /désactivez-le/);
});

test("création d'utilisateur : employé obligatoire, pas de second compte, identifiant unique", async () => {
  const emp = await employees.createEmployee(admin.actor, { firstName: "Marie", lastName: "TEST", position: "Secrétaire" });
  const role = await db.role.findUniqueOrThrow({ where: { code: "SECRETAIRE" } });
  const sa = await db.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  const base = { employeeId: emp.id, username: `marie${Date.now()}`, password: PASSWORD, roleId: role.id };
  await assert.rejects(users.createUser(admin.actor, { ...base, password: "court" }), /10 caractères/);
  await assert.rejects(users.createUser(admin.actor, { ...base, roleId: sa.id }), /Super Administrateur/);
  const u = await users.createUser(admin.actor, base);
  assert.equal(u.mustChangePassword, true);
  await assert.rejects(users.createUser(admin.actor, { ...base, username: "autre.nom" }), /déjà un compte/);
  const emp2 = await employees.createEmployee(admin.actor, { firstName: "Paul", lastName: "TEST", position: "X" });
  await assert.rejects(users.createUser(admin.actor, { ...base, employeeId: emp2.id }), /déjà pris/);
});

test("désactivation : connexion refusée, sessions coupées, historique conservé", async () => {
  const { user, token } = await actorWithRole("INFIRMIER");
  assert.ok(await actorFromToken(token));
  await users.setUserStatus(admin.actor, user.id, "DISABLED");
  assert.equal(await actorFromToken(token), null);
  const r = await login(user.username, PASSWORD);
  assert.match((r as { error: string }).error, /désactivé/);
  const d = await users.getUserDetail(admin.actor, user.id);
  assert.ok(d!.logins.some((l) => l.action === "LOGIN"));
  await users.setUserStatus(admin.actor, user.id, "ACTIVE");
  assert.ok((await login(user.username, PASSWORD)).ok);
});

test("garde-fous du Super Administrateur", async () => {
  await assert.rejects(users.setUserStatus(admin.actor, admin.user.id, "DISABLED"), /propre compte/);
  const sa = await db.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  await assert.rejects(roles.setRoleActive(admin.actor, sa.id, false), ValidationError);
  await assert.rejects(roles.deleteRole(admin.actor, sa.id), /système/);
});

test("changement de mot de passe : ancien requis, autres sessions déconnectées", async () => {
  const a = await actorWithRole("FINANCE");
  const other = await login(a.user.username, PASSWORD);
  await assert.rejects(changeOwnPassword(a.actor, "faux", "Nouveau12345", "Nouveau12345"), /actuel incorrect/);
  await assert.rejects(changeOwnPassword(a.actor, PASSWORD, "Nouveau12345", "Different123"), /correspondent pas/);
  await changeOwnPassword(a.actor, PASSWORD, "Nouveau12345", "Nouveau12345");
  assert.ok(await actorFromToken(a.token)); // session courante conservée
  assert.equal(await actorFromToken((other as { token: string }).token), null);
  assert.ok((await login(a.user.username, "Nouveau12345")).ok);
});

test("photo d'employé : le contenu réel est vérifié", async () => {
  await assert.rejects(
    employees.createEmployee(admin.actor, { firstName: "A", lastName: "B", position: "C" }, Buffer.from("<script>alert(1)</script>")),
    /Format de photo/,
  );
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const e = await employees.createEmployee(admin.actor, { firstName: "Photo", lastName: "TEST", position: "C" }, png);
  assert.match((await db.employee.findUniqueOrThrow({ where: { id: e.id } })).photoPath!, /^employees\/.+\.png$/);
});
