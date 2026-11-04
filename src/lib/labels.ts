import { MODULES } from "@/server/auth/permissions";

export const ACTION_TEXT: Record<string, string> = {
  LOGIN: "Connexion", LOGOUT: "Déconnexion", LOGIN_FAILED: "Échec de connexion", LOGIN_BLOCKED: "Connexion bloquée (trop d'essais)",
  LOGIN_REFUSED_DISABLED: "Connexion refusée (compte désactivé)", PASSWORD_CHANGED: "Mot de passe modifié", PASSWORD_RESET: "Mot de passe réinitialisé",
  CREATE: "Création", UPDATE: "Modification", DELETE: "Suppression", ACTIVATE: "Activation", DEACTIVATE: "Désactivation",
  PERMISSIONS_UPDATE: "Permissions modifiées", PHOTO_UPDATE: "Photo modifiée", CREATE_SUPER_ADMIN: "Création du Super Administrateur",
  VALIDATE: "Validation", CANCEL: "Annulation", ARRIVAL: "Arrivée enregistrée", ORIENT: "Orientation", SIGN: "Signature", REFER: "Orientation vers un confrère", ASSIGN: "Affectation", UNASSIGN: "Fin d'affectation", FORM_VERSION: "Nouvelle version de formulaire", SCHEDULED: "Planifié", RESCHEDULED: "Reporté", CANCELLED: "Annulé", MISSED: "Manqué", DOCUMENT_VIEW: "Consultation de document", ADMIT: "Admission", BED: "Attribution de lit", NOTE: "Note de suivi", DISCHARGE: "Sortie", SAMPLE: "Prélèvement", RESULTS: "Saisie de résultats", SUBMIT: "Soumission pour validation", STOCK_ENTRY: "Entrée en stock", STOCK_ADJUST: "Correction de stock", SALE: "Vente", CONSUME: "Consommation patient", REVERSAL: "Annulation / extourne",
};
const MODULE_TEXT: Record<string, string> = Object.fromEntries([
  ...MODULES.map((m) => [m.key, m.label]), ["auth", "Connexion"], ["users", "Utilisateurs"], ["roles", "Rôles"],
]);
export const actionText = (a: string) => ACTION_TEXT[a] ?? a;
export const moduleText = (m: string) => MODULE_TEXT[m] ?? m;

const dtf = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Lubumbashi" });
export const fmtDateTime = (d: Date | null | undefined) => (d ? dtf.format(d) : "—");
