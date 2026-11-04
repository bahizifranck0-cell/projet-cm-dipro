import Link from "next/link";
import { CalendarDays, ClipboardList, Stethoscope, Users } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { doctorQueue, myAssignments } from "@/server/services/consultations";
import { listAppointments, APPT_STATUS } from "@/server/services/appointments";
import { ageFrom, displayName } from "@/server/services/patients";
import { todayBounds } from "@/lib/normalize";
import { db } from "@/server/db";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { StartConsultation } from "@/components/medical/start-consultation";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Espace médecin" };
const hm = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lubumbashi" });

export default async function Page() {
  const actor = await requirePage("consultations", "view");
  const asg = await myAssignments(actor);
  const { start, end } = todayBounds();
  const [queue, appts, recent] = await Promise.all([
    doctorQueue(actor),
    actor.employeeId && can(actor, "appointments", "view") ? listAppointments(actor, { from: start, to: end, doctorId: actor.employeeId }) : [],
    actor.employeeId ? db.consultation.findMany({ where: { doctorId: actor.employeeId }, orderBy: { startedAt: "desc" }, take: 8, include: { patient: true, specialty: true } }) : [],
  ]);
  const specs = asg.map((a) => ({ id: a.specialtyId, name: a.specialty.name }));
  return (
    <>
      <PageHeader title={`Dr ${actor.displayName}`} subtitle={specs.length ? specs.map((s) => s.name).join(" · ") : "Aucune spécialité affectée"} />
      {!specs.length && <div className="mb-5"><Alert tone="warning" title="Aucune affectation médicale">Demandez au Super Administrateur de vous affecter à une spécialité (Paramètres → Spécialités) pour recevoir des patients.</Alert></div>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Patients à recevoir" value={queue.filter((v) => v.status !== "IN_CONSULTATION").length} icon={<Users className="size-4" />} />
        <StatCard label="Consultations en cours" value={queue.filter((v) => v.status === "IN_CONSULTATION").length} tone="amber" icon={<Stethoscope className="size-4" />} />
        <StatCard label="Rendez-vous aujourd'hui" value={appts.length} tone="green" icon={<CalendarDays className="size-4" />} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Patients en attente</h2>
          {queue.length === 0 ? <EmptyState title="Aucun patient en attente pour vous." /> : (
            <ul className="divide-y divide-white/10">{queue.map((v) => {
              const name = displayName(v.patient); const age = ageFrom(v.patient.birthDate);
              const mine = v.consultations.find((c) => c.doctorId === actor.employeeId);
              return (<li key={v.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2"><Link href={`/patients/${v.patient.id}`} className="font-semibold hover:underline">{name}</Link>{v.priority && <Badge tone="red">Urgent</Badge>}{v.status === "IN_CONSULTATION" && <Badge tone="amber">En consultation</Badge>}</p>
                  <p className="text-sm text-muted">{v.patient.patientNumber}{age !== null && ` · ${age} ans`} · arrivé {fmtDateTime(v.arrivedAt)}{v.reason && ` · ${v.reason}`}</p>
                </div>
                <StartConsultation visitId={v.id} specialties={specs} label={name} existing={mine?.id} />
              </li>);
            })}</ul>
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5" />Rendez-vous du jour</h2>
            {appts.length === 0 ? <p className="text-sm text-muted">Aucun rendez-vous aujourd'hui.</p> : (
              <ul className="space-y-2 text-sm">{appts.map((a) => <li key={a.id} className="flex justify-between gap-2"><span><strong>{hm.format(a.scheduledAt)}</strong> — {displayName(a.patient)}</span><Badge tone={a.status === "SCHEDULED" ? "blue" : "gray"}>{APPT_STATUS[a.status]}</Badge></li>)}</ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ClipboardList className="size-5" />Mes dernières consultations</h2>
            {recent.length === 0 ? <p className="text-sm text-muted">Aucune consultation.</p> : (
              <ul className="space-y-2 text-sm">{recent.map((c) => <li key={c.id}><Link href={`/consultations/${c.id}`} className="hover:underline">{displayName(c.patient)}</Link> <span className="text-muted">· {c.specialty.name} · {fmtDateTime(c.startedAt)}</span>{c.status === "DRAFT" && <> <Badge tone="amber">Brouillon</Badge></>}</li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
