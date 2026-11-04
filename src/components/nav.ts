import type { Actor } from "@/server/auth/actor";
import { can } from "@/server/auth/actor";

/** badge : nombre d'éléments non traités (alimenté par les notifications, Phase 13). Jamais de valeur fictive. */
export type NavItem = { href: string; label: string; short?: string; icon: string; section: "main" | "admin"; badge?: number };

/** Seuls les modules réellement disponibles et autorisés apparaissent. */
export function navFor(actor: Actor): NavItem[] {
  const items: (NavItem & { show: boolean })[] = [
    { href: "/", label: "Tableau de bord", short: "Accueil", icon: "LayoutDashboard", section: "main", show: can(actor, "dashboard", "view") },
    { href: "/reception", label: "Réception", icon: "ConciergeBell", section: "main", show: can(actor, "reception", "view") },
    { href: "/patients", label: "Patients", icon: "Contact", section: "main", show: can(actor, "patients", "view") },
    { href: "/medecin", label: "Espace médecin", short: "Médecin", icon: "Stethoscope", section: "main", show: can(actor, "consultations", "create") },
    { href: "/hospitalisation", label: "Urgences et hospitalisation", short: "Hospit.", icon: "BedDouble", section: "main", show: can(actor, "hospitalization", "view") },
    { href: "/rendez-vous", label: "Rendez-vous", icon: "CalendarDays", section: "main", show: can(actor, "appointments", "view") },
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
  return items.filter((i) => i.show).map(({ show: _s, ...i }) => i);
}
