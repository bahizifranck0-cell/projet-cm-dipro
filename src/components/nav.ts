import type { Actor } from "@/server/auth/actor";
import { can } from "@/server/auth/actor";

/** badge : nombre d'éléments non traités (alimenté par les notifications, Phase 13). Jamais de valeur fictive. */
export type NavItem = { href: string; label: string; short?: string; icon: string; section: "main" | "admin"; badge?: number };

/** Seuls les modules réellement disponibles et autorisés apparaissent. */
/** Module de notification → entrée de menu qui affiche le compteur. */
const BADGE_OF: Record<string, string> = {
  laboratory: "/laboratoire", consultations: "/medecin", hospitalization: "/hospitalisation", pharmacy: "/pharmacie",
  credit: "/credits", cash: "/caisse", billing: "/caisse", finance: "/finance", appointments: "/rendez-vous",
};

export function navFor(actor: Actor, counts: Record<string, number> = {}): NavItem[] {
  const items: (NavItem & { show: boolean })[] = [
    { href: "/", label: "Tableau de bord", short: "Accueil", icon: "LayoutDashboard", section: "main", show: can(actor, "dashboard", "view") },
    { href: "/reception", label: "Réception", icon: "ConciergeBell", section: "main", show: can(actor, "reception", "view") },
    { href: "/patients", label: "Patients", icon: "Contact", section: "main", show: can(actor, "patients", "view") },
    { href: "/medecin", label: "Espace médecin", short: "Médecin", icon: "Stethoscope", section: "main", show: can(actor, "consultations", "create") },
    { href: "/hospitalisation", label: "Urgences et hospitalisation", short: "Hospit.", icon: "BedDouble", section: "main", show: can(actor, "hospitalization", "view") },
    { href: "/laboratoire", label: "Laboratoire", short: "Labo", icon: "FlaskConical", section: "main", show: can(actor, "laboratory", "view") },
    { href: "/pharmacie", label: "Pharmacie", icon: "Pill", section: "main", show: can(actor, "pharmacy", "view") || can(actor, "hospitalization", "update") },
    { href: "/caisse", label: "Caisse", icon: "Banknote", section: "main", show: can(actor, "cash", "view") || can(actor, "billing", "view") },
    { href: "/credits", label: "Crédits et dettes", icon: "HandCoins", section: "main", show: can(actor, "credit", "view") },
    { href: "/finance", label: "Finance", icon: "Landmark", section: "main", show: can(actor, "finance", "view") },
    { href: "/tarifs", label: "Tarifs", icon: "Tags", section: "main", show: can(actor, "billing", "view") },
    { href: "/rendez-vous", label: "Rendez-vous", icon: "CalendarDays", section: "main", show: can(actor, "appointments", "view") },
    { href: "/documents", label: "Documents", icon: "Files", section: "main", show: can(actor, "documents", "view") },
    { href: "/rapports", label: "Rapports", icon: "BarChart3", section: "main", show: can(actor, "reports", "view") },
    { href: "/personnel", label: "Personnel", icon: "IdCard", section: "main", show: can(actor, "hr", "view") },
    { href: "/utilisateurs", label: "Utilisateurs", icon: "Users", section: "admin", show: actor.isSuperAdmin },
    { href: "/parametres/roles", label: "Rôles et permissions", icon: "ShieldCheck", section: "admin", show: actor.isSuperAdmin },
    { href: "/parametres/general", label: "Paramètres généraux", icon: "Settings", section: "admin", show: can(actor, "settings", "view") },
    { href: "/parametres/specialites", label: "Spécialités médicales", icon: "HeartPulse", section: "admin", show: can(actor, "settings", "view") },
    { href: "/parametres/formulaires", label: "Formulaires de maternité", icon: "Baby", section: "admin", show: can(actor, "settings", "view") },
    { href: "/parametres/departements", label: "Départements", icon: "Building2", section: "admin", show: can(actor, "settings", "view") },
    { href: "/parametres/journal", label: "Journal d'audit", icon: "ScrollText", section: "admin", show: can(actor, "audit", "view") },
    { href: "/parametres/guide-visuel", label: "Guide visuel", icon: "Palette", section: "admin", show: actor.isSuperAdmin },
  ];
  const badges: Record<string, number> = {};
  for (const [m, n] of Object.entries(counts)) if (BADGE_OF[m]) badges[BADGE_OF[m]] = (badges[BADGE_OF[m]] ?? 0) + n;
  // Les notifications ne sont plus une entrée du menu : elles s'ouvrent depuis la cloche de l'en-tête (voir notificationTotal).
  return items.filter((i) => i.show).map(({ show: _s, ...i }) => ({ ...i, badge: badges[i.href] || undefined }));
}

/** Nombre total de notifications non lues : badge de la cloche de l'en-tête. */
export function notificationTotal(counts: Record<string, number> = {}): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}
