// Catalogue central des permissions : (module, action).
// Ajouter un module ici puis lancer `npm run db:seed` pour le rendre disponible.

export const ACTIONS = ["view", "create", "update", "delete", "validate", "export"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  view: "Voir", create: "Créer", update: "Modifier", delete: "Supprimer", validate: "Valider", export: "Exporter",
};

export type ModuleDef = { key: string; label: string; actions: readonly Action[]; hint?: string };

export const MODULES = [
  { key: "dashboard", label: "Tableau de bord", actions: ["view"] },
  { key: "reception", label: "Réception", actions: ["view", "create", "update"] },
  { key: "patients", label: "Patients", actions: ["view", "create", "update", "delete", "export"] },
  { key: "consultations", label: "Médecins et consultations", actions: ["view", "create", "update", "validate", "export"] },
  { key: "appointments", label: "Rendez-vous", actions: ["view", "create", "update", "delete", "export"] },
  { key: "hospitalization", label: "Urgences et hospitalisation", actions: ["view", "create", "update", "validate", "export"] },
  { key: "laboratory", label: "Laboratoire", actions: ["view", "create", "update", "validate", "export"] },
  { key: "pharmacy", label: "Pharmacie", actions: ["view", "create", "update", "delete", "export"] },
  { key: "billing", label: "Facturation et tarifs", actions: ["view", "create", "update", "validate", "export"] },
  { key: "cash", label: "Caisse", actions: ["view", "create", "update", "export"] },
  { key: "credit", label: "Crédits patients", actions: ["view", "create", "validate"], hint: "Valider = décision du Directeur général" },
  { key: "finance", label: "Finance et comptabilité", actions: ["view", "create", "update", "validate", "export"] },
  { key: "hr", label: "Personnel / RH", actions: ["view", "create", "update", "delete", "validate", "export"] },
  { key: "documents", label: "Documents", actions: ["view", "create", "export"] },
  { key: "reports", label: "Rapports", actions: ["view", "export"] },
  { key: "audit", label: "Journal d'audit", actions: ["view", "export"] },
  { key: "settings", label: "Paramètres", actions: ["view", "update"] },
] as const satisfies readonly ModuleDef[];

export type ModuleKey = (typeof MODULES)[number]["key"];
export type PermissionKey = `${ModuleKey}.${Action}`;

export const permissionKey = (module: string, action: string) => `${module}.${action}`;

export const ALL_PERMISSION_KEYS: string[] = MODULES.flatMap((m) => m.actions.map((a) => permissionKey(m.key, a)));

export function isKnownPermission(key: string) {
  return ALL_PERMISSION_KEYS.includes(key);
}

/**
 * Gestion des utilisateurs et des rôles : réservée au Super Administrateur.
 * Elle n'est volontairement pas dans la matrice (personne d'autre ne peut se l'attribuer).
 */
export const SUPER_ADMIN_ONLY = ["users", "roles"] as const;
