import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, passwordProblem } from "../../src/server/auth/password";
import { can, type Actor } from "../../src/server/auth/actor";
import { ALL_PERMISSION_KEYS, MODULES } from "../../src/server/auth/permissions";
import { DEFAULT_ROLES } from "../../src/server/auth/default-roles";
import { toCode } from "../../src/server/services/validation";

test("hachage : bon mot de passe accepté, mauvais refusé, sel différent à chaque fois", async () => {
  const h1 = await hashPassword("Secret12345");
  const h2 = await hashPassword("Secret12345");
  assert.notEqual(h1, h2);
  assert.ok(await verifyPassword("Secret12345", h1));
  assert.ok(!(await verifyPassword("secret12345", h1)));
  assert.ok(!(await verifyPassword("x", "format-invalide")));
});

test("règle de mot de passe", () => {
  assert.ok(passwordProblem("court1"));
  assert.ok(passwordProblem("seulementdeslettres"));
  assert.equal(passwordProblem("Bonmotdepasse1"), null);
});

test("can() : super admin a tout, les autres uniquement ce qui est coché", () => {
  const base = { userId: "u", username: "u", roleId: "r", roleName: "r", departmentId: null, employeeId: null, displayName: "u" };
  const admin: Actor = { ...base, isSuperAdmin: true, permissions: new Set() };
  const cashier: Actor = { ...base, isSuperAdmin: false, permissions: new Set(["cash.view", "cash.create"]) };
  assert.ok(can(admin, "finance", "validate"));
  assert.ok(can(cashier, "cash", "create"));
  assert.ok(!can(cashier, "credit", "validate"));
});

test("les rôles par défaut n'utilisent que des permissions du catalogue", () => {
  for (const r of DEFAULT_ROLES)
    for (const [m, acts] of Object.entries(r.grants))
      for (const a of acts) assert.ok(ALL_PERMISSION_KEYS.includes(`${m}.${a}`), `${r.code} : ${m}.${a}`);
  assert.equal(new Set(MODULES.map((m) => m.key)).size, MODULES.length);
  // Seul le Directeur général valide les crédits.
  assert.deepEqual(DEFAULT_ROLES.filter((r) => r.grants.credit?.includes("validate")).map((r) => r.code), ["DIRECTEUR_GENERAL"]);
});

test("toCode", () => assert.equal(toCode("Responsable Pharmacie & Boutique"), "RESPONSABLE_PHARMACIE_BOUTIQUE"));
