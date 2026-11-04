// Rôles listés au §7.3 du cahier des charges, avec une PROPOSITION de permissions
// tirée des descriptions de chaque poste. Le Super Administrateur les ajuste librement.
// Le seed ne réécrit jamais les permissions d'un rôle déjà existant.

type Grant = Record<string, string[]>;
const all = ["view", "create", "update", "delete", "validate", "export"];

export const DEFAULT_ROLES: { code: string; name: string; description: string; grants: Grant }[] = [
  {
    code: "DIRECTEUR_GENERAL", name: "Directeur général",
    description: "Autorité opérationnelle : rapports, suivi, validation des crédits patients.",
    grants: { dashboard: ["view"], reports: ["view", "export"], credit: ["view", "validate"], finance: ["view"], billing: ["view"], cash: ["view"], hr: ["view"], audit: ["view"], documents: ["view"] },
  },
  {
    code: "ADMINISTRATION", name: "Administration",
    description: "Gestion administrative et du personnel.",
    grants: { dashboard: ["view"], hr: ["view", "create", "update"], documents: ["view", "create", "export"], reports: ["view"], settings: ["view"] },
  },
  {
    code: "FINANCE", name: "Finance / comptabilité",
    description: "Journaux, dépenses, recettes, dettes, réconciliations.",
    grants: { dashboard: ["view"], finance: ["view", "create", "update", "validate", "export"], billing: ["view", "update", "export"], cash: ["view", "export"], credit: ["view"], hr: ["view"], reports: ["view", "export"], documents: ["view", "export"] },
  },
  {
    code: "CAISSIER", name: "Caissier",
    description: "Encaissements, reçus, demandes de crédit.",
    grants: { dashboard: ["view"], cash: ["view", "create", "export"], billing: ["view"], credit: ["view", "create"], patients: ["view"], documents: ["view", "create"] },
  },
  {
    code: "RECEPTIONNISTE", name: "Réceptionniste",
    description: "Accueil et orientation des patients.",
    grants: { dashboard: ["view"], reception: ["view", "create", "update"], patients: ["view"], appointments: ["view"] },
  },
  {
    code: "SECRETAIRE", name: "Secrétaire",
    description: "Création et recherche des dossiers patients.",
    grants: { dashboard: ["view"], patients: ["view", "create", "update"], reception: ["view", "create"], appointments: ["view", "create", "update"] },
  },
  {
    code: "MEDECIN", name: "Médecin",
    description: "Rôle commun à tous les médecins ; la spécialité est une affectation.",
    grants: { dashboard: ["view"], patients: ["view"], consultations: ["view", "create", "update", "validate", "export"], appointments: ["view", "create", "update", "export"], laboratory: ["view", "create"], hospitalization: ["view", "create"], pharmacy: ["view"], documents: ["view", "create", "export"] },
  },
  {
    code: "INFIRMIER", name: "Infirmier",
    description: "Soins et suivi des patients.",
    grants: { dashboard: ["view"], patients: ["view"], consultations: ["view"], hospitalization: ["view", "update"], pharmacy: ["view"] },
  },
  {
    code: "RESP_URGENCES_HOSPITALISATION", name: "Responsable urgences et hospitalisation",
    description: "Un seul service : urgences, hospitalisation, maternité, chambres et lits.",
    grants: { dashboard: ["view"], patients: ["view"], hospitalization: all.filter((a) => a !== "delete"), pharmacy: ["view"], documents: ["view", "create"] },
  },
  {
    code: "RESP_LABORATOIRE", name: "Responsable du laboratoire",
    description: "Demandes, prélèvements, résultats et validation.",
    grants: { dashboard: ["view"], patients: ["view"], laboratory: ["view", "create", "update", "validate", "export"], documents: ["view", "create", "export"] },
  },
  {
    code: "RESP_PHARMACIE", name: "Responsable de la pharmacie",
    description: "Produits, stock, boutique, ventes et consommations.",
    grants: { dashboard: ["view"], pharmacy: ["view", "create", "update", "delete", "export"], reports: ["view"] },
  },
  {
    code: "PERSONNEL_ADMINISTRATIF", name: "Personnel administratif",
    description: "Tâches administratives autorisées.",
    grants: { dashboard: ["view"], documents: ["view"] },
  },
];
