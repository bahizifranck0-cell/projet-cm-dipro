import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { LAB_STATUS, labStats, listLabRequests } from "@/server/services/laboratory";
import { displayName } from "@/server/services/patients";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";
import type { LabRequestStatus } from "@prisma/client";

export const metadata = { title: "Laboratoire" };
const VIEWS = [["open", "À traiter"], ["REQUESTED", "Nouvelles"], ["AWAITING_VALIDATION", "À valider"], ["VALIDATED", "Terminées"], ["CANCELLED", "Annulées"]] as const;
const tone = (s: LabRequestStatus) => (s === "VALIDATED" ? "green" : s === "CANCELLED" ? "red" : s === "AWAITING_VALIDATION" ? "amber" : "blue");

export default async function Page({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const actor = await requirePage("laboratory", "view");
  const vue = (await searchParams).vue ?? "open";
  const [list, stats] = await Promise.all([listLabRequests(actor, vue as LabRequestStatus | "open"), labStats()]);
  return (<>
    <PageHeader title="Laboratoire" subtitle="Demandes, prélèvements, résultats et validation"
      actions={<Link href="/laboratoire/catalogue" className={buttonClass("secondary")}><BookOpen className="size-4" />Catalogue d'analyses</Link>} />
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Nouvelles demandes" value={stats.REQUESTED ?? 0} />
      <StatCard label="Prélevées / en cours" value={(stats.SAMPLED ?? 0) + (stats.IN_PROGRESS ?? 0)} tone="amber" />
      <StatCard label="À valider" value={stats.AWAITING_VALIDATION ?? 0} tone="red" />
      <StatCard label="Validées" value={stats.VALIDATED ?? 0} tone="green" />
    </div>
    <nav aria-label="Filtrer les demandes" className="scroll-area mb-4 flex gap-2 pb-1">{VIEWS.map(([k, l]) => <Link key={k} href={`/laboratoire?vue=${k}`} aria-current={vue === k ? "page" : undefined} className={buttonClass(vue === k ? "secondary" : "ghost", "!min-h-10 shrink-0")}>{l}</Link>)}</nav>
    {list.length === 0 ? <EmptyState title="Aucune demande." /> : (
      <ul className="space-y-3">{list.map((r) => (
        <li key={r.id}><Link href={`/laboratoire/${r.id}`} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4 hover:border-white/35">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">{r.number} — {displayName(r.patient)}<Badge tone={tone(r.status)}>{LAB_STATUS[r.status]}</Badge></p>
            <p className="text-sm text-muted">{r.items.map((i) => i.labTest.name).join(", ")} · {fmtDateTime(r.requestedAt)}</p>
          </div>
        </Link></li>))}</ul>
    )}
    {!can(actor, "laboratory", "update") && <p className="mt-4 text-xs text-muted">Lecture seule.</p>}
  </>);
}
