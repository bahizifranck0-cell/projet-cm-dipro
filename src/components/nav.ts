import type { Actor } from "@/server/auth/actor";
import { can } from "@/server/auth/actor";

export type NavItem = { href: string; label: string; icon: string; section: "main" | "admin" };

/** Seuls les modules réellement disponibles et autorisés apparaissent. */
export function navFor(actor: Actor): NavItem[] {
  const items: (NavItem & { show: boolean })[] = [
    { href: "/", label: "Tableau de bord", icon: "LayoutDashboard", section: "main", show: can(actor, "dashboard", "view") },
    { href: "/personnel", label: "Personnel", icon: "IdCard", section: "main", show: can(actor, "hr", "view") },
    { href: "/utilisateurs", label: "Utilisateurs", icon: "Users", section: "admin", show: actor.isSuperAdmin },
    { href: "/parametres/roles", label: "Rôles et permissions", icon: "ShieldCheck", section: "admin", show: actor.isSuperAdmin },
    { href: "/parametres/departements", label: "Départements", icon: "Building2", section: "admin", show: can(actor, "settings", "view") },
    { href: "/parametres/journal", label: "Journal d'audit", icon: "ScrollText", section: "admin", show: can(actor, "audit", "view") },
  ];
  return items.filter((i) => i.show).map(({ show: _s, ...i }) => i);
}
