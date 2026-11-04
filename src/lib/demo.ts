/** Comptes de démonstration : affichés UNIQUEMENT sur l'instance de démo (CMDPRO_DEMO=1, base séparée). */
export const DEMO_PASSWORD = "Demo2026cmd";
export const DEMO_MAIN = [
  { username: "demo.admin", label: "Administrateur", role: "Super Administrateur" },
  { username: "demo.finance", label: "Finance / Comptabilité", role: "Finance" },
];
export const DEMO_OTHERS = [
  { username: "demo.dg", role: "Directeur général" }, { username: "demo.medecin", role: "Médecin généraliste" },
  { username: "demo.dentiste", role: "Médecin dentiste" }, { username: "demo.secretaire", role: "Secrétaire" },
  { username: "demo.accueil", role: "Réceptionniste" }, { username: "demo.caisse", role: "Caissier" },
  { username: "demo.labo", role: "Responsable laboratoire" }, { username: "demo.pharmacie", role: "Responsable pharmacie" },
  { username: "demo.hospit", role: "Urgences et hospitalisation" }, { username: "demo.infirmier", role: "Infirmier" },
  { username: "demo.rh", role: "Administration / RH" },
];
export const isDemo = () => process.env.CMDPRO_DEMO === "1";
