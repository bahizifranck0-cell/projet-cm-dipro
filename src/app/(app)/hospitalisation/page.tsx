import Link from "next/link";
import { BedDouble, Baby, Siren, Settings2 } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { ADMISSION_TYPE, bedBoard, hospitalStats, listAdmissions } from "@/server/services/hospitalization";
import { displayName } from "@/server/services/patients";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Urgences et hospitalisation" };
const tone = { EMERGENCY: "red", HOSPITALIZATION: "blue", MATERNITY: "amber" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const actor = await requirePage("hospitalization", "view");
  const past = (await searchParams).vue === "sorties";
  const [list, stats, board] = await Promise.all([listAdmissions(actor, past ? "DISCHARGED" : "ACTIVE"), hospitalStats(), bedBoard()]);
  return (
    <>
      <PageHeader title="Urgences et hospitalisation" subtitle="Un seul service : urgences, hospitalisation et maternité"
        actions={can(actor, "hospitalization", "create") && <Link href="/hospitalisation/chambres" className={buttonClass("secondary")}><Settings2 className="size-4" />Chambres et lits</Link>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Urgences en cours" value={stats.byType.EMERGENCY ?? 0} tone="red" icon={<Siren className="size-4" />} />
        <StatCard label="Hospitalisés" value={stats.byType.HOSPITALIZATION ?? 0} icon={<BedDouble className="size-4" />} />
        <StatCard label="Maternité" value={stats.byType.MATERNITY ?? 0} tone="amber" icon={<Baby className="size-4" />} />
        <StatCard label="Lits disponibles" value={`${stats.available} / ${stats.available + stats.occupied + stats.outOfService}`} tone="green" hint={stats.outOfService ? `${stats.outOfService} hors service` : undefined} />
      </div>
      <div className="mb-4 flex gap-2">
        <Link href="/hospitalisation" aria-current={!past ? "page" : undefined} className={buttonClass(past ? "ghost" : "secondary", "!min-h-10")}>Patients présents</Link>
        <Link href="/hospitalisation?vue=sorties" aria-current={past ? "page" : undefined} className={buttonClass(past ? "secondary" : "ghost", "!min-h-10")}>Sorties récentes</Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <div>
          {list.length === 0 ? <EmptyState title={past ? "Aucune sortie." : "Aucun patient admis."}>Les admissions se font depuis la consultation (« Hospitaliser ») ou le dossier du patient.</EmptyState> : (
            <ul className="space-y-3">{list.map((a) => {
              const bed = a.bedAssignments[0]?.bed;
              return (<li key={a.id}><Link href={`/hospitalisation/${a.id}`} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4 hover:border-white/35">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{displayName(a.patient)}<Badge tone={tone[a.type]}>{ADMISSION_TYPE[a.type]}</Badge></p>
                  <p className="text-sm text-muted">{a.patient.patientNumber} · admis {fmtDateTime(a.admittedAt)}{a.reason && ` · ${a.reason}`}{past && a.dischargedAt && ` · sorti ${fmtDateTime(a.dischargedAt)}`}</p>
                </div>
                {!past && (bed ? <Badge tone="blue">{bed.room.code} · lit {bed.code}</Badge> : <Badge tone="amber">Lit à attribuer</Badge>)}
              </Link></li>);
            })}</ul>
          )}
        </div>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Occupation des lits</h2>
          {board.length === 0 ? <p className="text-sm text-muted">Aucune chambre configurée.</p> : board.map((r) => (
            <div key={r.id} className="mb-4">
              <p className="mb-2 text-sm font-medium">{r.code} — {r.name} <span className="text-muted">({r.category})</span></p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{r.beds.map((b) => {
                const occ = b.assignments[0]?.admission;
                return (<div key={b.id} className={`rounded-xl border p-2 text-xs ${b.status === "AVAILABLE" ? "border-success/50 bg-success/10" : b.status === "OCCUPIED" ? "border-brand-400/50 bg-brand-500/15" : "border-white/15 bg-white/5 opacity-70"}`}>
                  <p className="font-semibold">Lit {b.code}</p>
                  <p className="truncate">{occ ? <Link href={`/hospitalisation/${occ.id}`} className="hover:underline">{displayName(occ.patient)}</Link> : b.status === "AVAILABLE" ? "Libre" : "Hors service"}</p>
                </div>);
              })}</div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
