import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { navFor } from "@/components/nav";
import { Card, PageHeader, StatCard } from "@/components/ui/card";
import { can } from "@/server/auth/actor";
import { receptionStats } from "@/server/services/reception";
import { Clock, Stethoscope, Users } from "lucide-react";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Africa/Lubumbashi" }).format(new Date()));
  return h >= 18 || h < 4 ? "Bonsoir" : "Bonjour";
}

export default async function Dashboard() {
  const actor = await requireActor();
  const shortcuts = navFor(actor).filter((i) => i.href !== "/" && i.href !== "/notifications");
  const stats = can(actor, "reception", "view") ? await receptionStats() : null;
  return (
    <>
      <PageHeader title={`${greeting()}, ${actor.displayName}`} subtitle={actor.roleName} />
      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Arrivées aujourd'hui" value={stats.arrivals} icon={<Users className="size-4" />} />
          <StatCard label="En attente d'orientation" value={stats.waiting} tone="amber" icon={<Clock className="size-4" />} />
          <StatCard label="Orientés ou en consultation" value={stats.oriented + stats.inConsultation} tone="green" icon={<Stethoscope className="size-4" />} />
        </div>
      )}
      <Card>
        <h2 className="font-semibold">Accès rapides</h2>
        {shortcuts.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shortcuts.map((s) => (
              <Link key={s.href} href={s.href} className="rounded-xl border border-white/20 bg-white/6 px-4 py-3 text-sm font-medium hover:border-white/40 hover:bg-white/12">{s.label}</Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Aucun module n'est encore attribué à votre rôle. Contactez le Super Administrateur.</p>
        )}
        <p className="mt-5 text-xs text-muted">Les indicateurs de votre service apparaîtront ici au fur et à mesure de la mise en service des modules.</p>
      </Card>
    </>
  );
}
