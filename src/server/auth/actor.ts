import { permissionKey, type Action, type ModuleKey } from "./permissions";

/** Utilisateur authentifié qui effectue une opération. */
export type Actor = {
  userId: string;
  username: string;
  isSuperAdmin: boolean;
  roleId: string;
  roleName: string;
  departmentId: string | null;
  employeeId: string | null;
  displayName: string;
  permissions: ReadonlySet<string>;
  sessionId?: string;
  mustChangePassword?: boolean;
  ip?: string | null;
};

export class ForbiddenError extends Error {
  constructor(message = "Vous n'avez pas l'autorisation d'effectuer cette opération.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function can(actor: Actor, module: ModuleKey, action: Action): boolean {
  return actor.isSuperAdmin || actor.permissions.has(permissionKey(module, action));
}

export function assertCan(actor: Actor, module: ModuleKey, action: Action) {
  if (!can(actor, module, action)) throw new ForbiddenError();
}

export function assertSuperAdmin(actor: Actor) {
  if (!actor.isSuperAdmin) throw new ForbiddenError("Opération réservée au Super Administrateur.");
}
