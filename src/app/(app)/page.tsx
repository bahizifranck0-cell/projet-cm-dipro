import Link from "next/link";
import { BedDouble, Banknote, Clock, FlaskConical, HandCoins, Pill, Stethoscope, Users } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { navFor } from "@/components/nav";
import { receptionStats } from "@/server/services/reception";
import { doctorQueue } from "@/server/services/consultations";
import { labStats } from "@/server/services/laboratory";
import { pharmacyStats } from "@/server/services/pharmacy";
import { hospitalStats } from "@/server/services/hospitalization";
import { fmtMoney } from "@/server/services/billing";
import { todayBounds } from "@/lib/normalize";
import { db } from "@/server/db";
import { Card, PageHeader, StatCard } from "@/components/ui/card";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Africa/Lubumbashi" }).format(new Date()));
  return h >= 18 || h < 4 ? "Bonsoir" : "Bonjour";
}

/** Tableau de bord adapté au rôle : seules les cartes des modules autorisés, avec des chiffres réels. */
export default async function Dashboard() {
  const actor = await requireActor();
  const shortcuts = navFor(actor).filter((i) => i.href !== "/" && i.href !== "/notifications");
  const { start } = todayBounds();
  const cards: React.ReactNode[] = [];
  const S = (k: string, href: string, label: string, value: React.ReactNode, tone?: "blue" | "green" | "amber" | "red", icon?: React.ReactNode) =>
    cards.push(<Link key={k} href={href} className="block rounded-2xl focus-visible:outline-2"><StatCard label={label} value={value} tone={tone} icon={icon} /></Link>);

  if (can(actor, "reception", "view")) {
    const r = await receptionStats();
    S("arr", "/reception", "Arrivées aujourd'hui", r.arrivals, "blue", <Users className="size-4" />);
    S("wait", "/reception", "En attente d'orientation", r.waiting, "amber", <Clock className="size-4" />);
  }
  if (can(actor, "consultations", "create") && actor.employeeId) {
    const q = await doctorQueue(actor);
    S("doc", "/medecin", "Mes patients à recevoir", q.filter((v) => v.status !== "IN_CONSULTATION").length, "green", <Stethoscope className="size-4" />);
  }
  if (can(actor, "hospitalization", "view")) {
    const h = await hospitalStats();
    S("hosp", "/hospitalisation", "Patients hospitalisés", Object.values(h.byType).reduce((a, b) => a + b, 0), "blue", <BedDouble className="size-4" />);
    S("beds", "/hospitalisation", "Lits disponibles", h.available, "green");
  }
  if (can(actor, "laboratory", "view")) {
    const l = await labStats();
    S("lab", "/laboratoire", "Analyses à traiter", (l.REQUESTED ?? 0) + (l.SAMPLED ?? 0) + (l.IN_PROGRESS ?? 0), "amber", <FlaskConical className="size-4" />);
    if (can(actor, "laboratory", "validate")) S("labv", "/laboratoire?vue=AWAITING_VALIDATION", "Résultats à valider", l.AWAITING_VALIDATION ?? 0, "red");
  }
  if (can(actor, "pharmacy", "view")) {
    const p = await pharmacyStats();
    S("ph", "/pharmacie", "Produits en alerte de stock", p.low, p.low ? "red" : "green", <Pill className="size-4" />);
  }
  if (can(actor, "cash", "view")) {
    const pays = await db.payment.groupBy({ by: ["currency"], where: { receivedAt: { gte: start }, ...(can(actor, "finance", "view") ? {} : { cashierId: actor.userId }) }, _sum: { amount: true } });
    const open = await db.invoice.count({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } } });
    S("cash", "/caisse", "Encaissé aujourd'hui", pays.length ? pays.map((p) => fmtMoney(p._sum.amount ?? 0, p.currency)).join(" · ") : "0", "green", <Banknote className="size-4" />);
    S("inv", "/caisse", "Factures à régler", open, "amber");
  }
  if (can(actor, "credit", "validate")) S("cr", "/credits", "Crédits à décider", await db.creditRequest.count({ where: { status: "PENDING" } }), "red", <HandCoins className="size-4" />);
  if (can(actor, "finance", "view")) {
    S("debt", "/credits", "Dettes ouvertes", await db.debt.count({ where: { status: { not: "SETTLED" } } }), "amber");
    if (can(actor, "finance", "validate")) S("exp", "/finance/depenses", "Dépenses à examiner", await db.expense.count({ where: { status: "SUBMITTED" } }), "amber");
  }

  return (
    <>
      <PageHeader title={`${greeting()}, ${actor.displayName}`} subtitle={actor.roleName} />
      {cards.length > 0 && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards}</div>}
      <Card>
        <h2 className="font-semibold">Accès rapides</h2>
        {shortcuts.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shortcuts.map((s) => <Link key={s.href} href={s.href} className="rounded-xl border border-white/20 bg-white/6 px-4 py-3 text-sm font-medium hover:border-white/40 hover:bg-white/12">{s.label}</Link>)}
          </div>
        ) : <p className="mt-2 text-sm text-muted">Aucun module n&apos;est encore attribué à votre rôle. Contactez le Super Administrateur.</p>}
      </Card>
    </>
  );
}
