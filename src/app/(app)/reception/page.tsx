import Link from "next/link";
import { Clock, Plus, Search, Siren, Stethoscope, Users } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { listQueue, receptionStats, VISIT_STATUS_LABEL } from "@/server/services/reception";
import { orientationOptions } from "@/server/services/lookups";
import { ageFrom, displayName } from "@/server/services/patients";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { CancelVisitButton, OrientButton } from "@/components/patients/visit-dialogs";

export const metadata = { title: "Réception" };
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lubumbashi" });
const dayTime = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lubumbashi" });
const tone = (s: string) => (s === "CANCELLED" ? "red" : s === "CLOSED" ? "gray" : s === "WAITING" ? "amber" : "blue") as "red" | "gray" | "amber" | "blue";

export default async function Page({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const actor = await requirePage("reception", "view");
  const all = (await searchParams).vue === "jour";
  const [queue, stats] = await Promise.all([listQueue(actor, { status: all ? "all" : "open" }), receptionStats()]);
  const canOrient = can(actor, "reception", "update");
  const opts = canOrient ? await orientationOptions() : null;
  const today = Date.now() - 20 * 3600e3;

  return (
    <>
      <PageHeader title="Réception" subtitle="Accueil, file d'attente et orientation des patients"
        actions={<>
          <Link href="/patients" className={buttonClass("secondary")}><Search className="size-4" />Rechercher un patient</Link>
          {can(actor, "patients", "create") && <Link href="/patients/nouveau" className={buttonClass()}><Plus className="size-4" />Nouveau patient</Link>}
        </>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Arrivées aujourd'hui" value={stats.arrivals} icon={<Users className="size-4" />} />
        <StatCard label="À orienter" value={stats.waiting} tone="amber" icon={<Clock className="size-4" />} />
        <StatCard label="Orientés" value={stats.oriented} icon={<Siren className="size-4" />} />
        <StatCard label="En consultation" value={stats.inConsultation} tone="green" icon={<Stethoscope className="size-4" />} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Affichage de la file">
        <Link href="/reception" aria-current={!all ? "page" : undefined} className={buttonClass(all ? "ghost" : "secondary", "!min-h-10")}>Passages en cours</Link>
        <Link href="/reception?vue=jour" aria-current={all ? "page" : undefined} className={buttonClass(all ? "secondary" : "ghost", "!min-h-10")}>Tous les passages du jour</Link>
      </div>

      {queue.length === 0 ? (
        <EmptyState title={all ? "Aucun passage aujourd'hui." : "Aucun patient en attente."}>
          <p>Pour enregistrer une arrivée : recherchez le patient, ouvrez son dossier puis « Enregistrer l'arrivée ».</p>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {queue.map((v) => {
            const name = displayName(v.patient);
            const age = ageFrom(v.patient.birthDate);
            const openable = v.status === "WAITING" || v.status === "ORIENTED";
            return (
              <li key={v.id} className={`glass flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center ${v.priority ? "border-l-4 border-l-danger" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/patients/${v.patient.id}`} className="font-semibold hover:underline">{name}</Link>
                    {v.priority && <Badge tone="red">Urgent</Badge>}
                    <Badge tone={tone(v.status)}>{VISIT_STATUS_LABEL[v.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {v.patient.patientNumber}{age !== null && ` · ${age} an${age > 1 ? "s" : ""}`} · arrivé {v.arrivedAt.getTime() < today ? `le ${dayTime.format(v.arrivedAt)}` : `à ${time.format(v.arrivedAt)}`}
                    {v.reason && ` · ${v.reason}`}
                  </p>
                  {(v.orientedToDepartment || v.orientedToDoctor) && (
                    <p className="mt-1 text-sm">→ {[v.orientedToDepartment?.name, v.orientedToDoctor && `Dr ${v.orientedToDoctor.lastName.toUpperCase()} ${v.orientedToDoctor.firstName}`].filter(Boolean).join(" — ")}</p>
                  )}
                  {v.cancelReason && <p className="mt-1 text-sm text-[#ffd0d5]">Annulé : {v.cancelReason}</p>}
                </div>
                {canOrient && openable && opts && (
                  <div className="flex flex-wrap gap-2">
                    <OrientButton visitId={v.id} patientName={name} departments={opts.departments} doctors={opts.doctors}
                      initial={{ departmentId: v.orientedToDepartmentId, doctorId: v.orientedToDoctorId }} />
                    <CancelVisitButton visitId={v.id} patientName={name} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
