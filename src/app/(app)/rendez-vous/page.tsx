import Link from "next/link";
import { FileText } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { markRead } from "@/server/services/notifications";
import { can } from "@/server/auth/actor";
import { listAppointments, APPT_STATUS } from "@/server/services/appointments";
import { listDoctors } from "@/server/services/reception";
import { displayName } from "@/server/services/patients";
import { db } from "@/server/db";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { AppointmentActions } from "@/components/medical/appointment-dialogs";
import type { AppointmentStatus } from "@prisma/client";

export const metadata = { title: "Rendez-vous" };
const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lubumbashi" });
const hm = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lubumbashi" });
const tone = (s: AppointmentStatus) => ({ SCHEDULED: "blue", HONORED: "green", MISSED: "amber", CANCELLED: "red", RESCHEDULED: "gray" } as const)[s];

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; medecin?: string; q?: string; statut?: string }> }) {
  const actor = await requirePage("appointments", "view");
  await markRead(actor, "all", "appointments"); // module sans page de détail : consulter la liste vaut lecture
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
  const from = new Date(`${date}T00:00:00+02:00`);
  const to = new Date(from.getTime() + (sp.q ? 365 : 1) * 86400e3);
  const [list, doctors] = await Promise.all([
    listAppointments(actor, { from: sp.q ? undefined : from, to: sp.q ? undefined : to, doctorId: sp.medecin || undefined, q: sp.q || undefined, status: (sp.statut as AppointmentStatus) || undefined }),
    listDoctors(),
  ]);
  const docs = await db.document.findMany({ where: { entityType: "Appointment", entityId: { in: list.map((a) => a.id) } }, orderBy: { version: "desc" } });
  const canEdit = can(actor, "appointments", "update");
  return (
    <>
      <PageHeader title="Rendez-vous" subtitle={sp.q ? `Recherche « ${sp.q} »` : day.format(from)} />
      <form className="glass mb-5 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label className="block"><span className="mb-1 block text-sm">Date</span><input type="date" name="date" defaultValue={date} className="field" /></label>
        <label className="block"><span className="mb-1 block text-sm">Médecin</span><select name="medecin" defaultValue={sp.medecin ?? ""} className="field"><option value="">Tous</option>{doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.lastName.toUpperCase()} {d.firstName}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-sm">Statut</span><select name="statut" defaultValue={sp.statut ?? ""} className="field"><option value="">Tous</option>{Object.entries(APPT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-sm">Patient ou n° de RDV</span><input name="q" defaultValue={sp.q} className="field" placeholder="Nom, dossier, RDV-…" /></label>
        <button className={buttonClass("secondary")}>Afficher</button>
      </form>
      {list.length === 0 ? <EmptyState title="Aucun rendez-vous.">Les rendez-vous se créent depuis la consultation ou le dossier du patient.</EmptyState> : (
        <ul className="space-y-3">{list.map((a) => {
          const name = displayName(a.patient); const doc = docs.find((d) => d.entityId === a.id);
          return (<li key={a.id} className="glass flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center">
            <div className="w-24 shrink-0 text-xl font-semibold">{hm.format(a.scheduledAt)}{sp.q && <span className="block text-xs font-normal text-muted">{day.format(a.scheduledAt)}</span>}</div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2"><Link href={`/patients/${a.patientId}`} className="font-semibold hover:underline">{name}</Link><Badge tone={tone(a.status)}>{APPT_STATUS[a.status]}</Badge></p>
              <p className="text-sm text-muted">{a.number} · Dr {a.doctor.lastName.toUpperCase()} {a.doctor.firstName}{a.specialty && ` · ${a.specialty.name}`} · {a.reason}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {doc && <a href={`/fichiers/documents/${doc.id}`} target="_blank" className={buttonClass("secondary")} aria-label={`Document du rendez-vous ${a.number}`}><FileText className="size-4" />Imprimer</a>}
              {canEdit && a.status === "SCHEDULED" && <AppointmentActions id={a.id} label={`le rendez-vous de ${name}`} />}
            </div>
          </li>);
        })}</ul>
      )}
    </>
  );
}
