import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Phone, MapPin, Cake } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { ageFrom, displayName, getPatientRecord } from "@/server/services/patients";
import { OPEN_STATUSES, VISIT_STATUS_LABEL } from "@/server/services/reception";
import { orientationOptions } from "@/server/services/lookups";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { buttonClass } from "@/components/ui/button-class";
import { ArrivalButton } from "@/components/patients/visit-dialogs";
import { fmtDateTime } from "@/lib/labels";
import { patientConsultations } from "@/server/services/consultations";
import { listAppointments, APPT_STATUS } from "@/server/services/appointments";
import { listSpecialties } from "@/server/services/specialties";
import { DOC_PERMISSION } from "@/server/services/documents";
import { NewAppointment } from "@/components/medical/appointment-dialogs";
import { db } from "@/server/db";
import { todayBounds } from "@/lib/normalize";
import { availableBeds } from "@/server/services/beds";
import { AdmitButton } from "@/components/medical/hospital-forms";
import { LAB_STATUS, patientLabRequests } from "@/server/services/laboratory";

export const metadata = { title: "Dossier patient" };
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const tone = (s: string) => (s === "CANCELLED" ? "red" : s === "CLOSED" ? "gray" : s === "WAITING" ? "amber" : "blue") as "red" | "gray" | "amber" | "blue";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cree?: string; modifie?: string; arrivee?: string }> }) {
  const actor = await requirePage("patients", "view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const rec = await getPatientRecord(actor, id);
  if (!rec) notFound();
  const { patient: p, creator } = rec;
  const age = ageFrom(p.birthDate);
  const open = p.visits.find((v) => OPEN_STATUSES.includes(v.status));
  const opts = (can(actor, "reception", "create") && !open) || can(actor, "appointments", "create") ? await orientationOptions() : null;
  const [consults, appts, docs, specs] = await Promise.all([
    patientConsultations(actor, p.id),
    can(actor, "appointments", "view") ? listAppointments(actor, { patientId: p.id }) : Promise.resolve([]),
    db.document.findMany({ where: { patientId: p.id }, orderBy: { createdAt: "desc" } }),
    can(actor, "appointments", "create") ? listSpecialties(true) : Promise.resolve([]),
  ]);
  const labs = await patientLabRequests(actor, p.id);
  const activeAdmission = await db.admission.findFirst({ where: { patientId: p.id, status: "ACTIVE" } });
  const beds = can(actor, "hospitalization", "create") && !activeAdmission ? await availableBeds() : null;
  const visibleDocs = docs.filter((d) => { const [m, a] = DOC_PERMISSION[d.type]; return can(actor, m, a) || can(actor, "documents", "view"); });
  const { start, end } = todayBounds();
  const todayAppts = appts.filter((a) => a.status === "SCHEDULED" && a.scheduledAt >= new Date(start.getTime() - 86400e3) && a.scheduledAt < new Date(end.getTime() + 86400e3));

  const visits = p.visits.length === 0 ? <EmptyState title="Aucun passage enregistré." /> : (
    <ol className="relative space-y-3 border-l border-white/20 pl-5">
      {p.visits.map((v) => (
        <li key={v.id} className="relative">
          <span className="absolute top-2 -left-[26px] size-3 rounded-full border-2 border-brand-900 bg-brand-400" aria-hidden />
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{fmtDateTime(v.arrivedAt)}{v.priority && <span className="ml-2"><Badge tone="red">Urgent</Badge></span>}</p>
              <Badge tone={tone(v.status)}>{VISIT_STATUS_LABEL[v.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink/90">{v.reason ?? "Motif non précisé"}</p>
            {(v.orientedToDepartment || v.orientedToDoctor) && (
              <p className="mt-1 text-sm text-muted">Orienté vers : {[v.orientedToDepartment?.name, v.orientedToDoctor && `Dr ${v.orientedToDoctor.lastName.toUpperCase()} ${v.orientedToDoctor.firstName}`].filter(Boolean).join(" — ")}</p>
            )}
            {v.cancelReason && <p className="mt-1 text-sm text-[#ffd0d5]">Motif d'annulation : {v.cancelReason}</p>}
          </div>
        </li>
      ))}
    </ol>
  );

  const info = (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {[
        ["Numéro de dossier", p.patientNumber], ["Nom", p.lastName], ["Post-nom", p.postName ?? "—"], ["Prénom", p.firstName],
        ["Sexe", p.sex === "F" ? "Féminin" : p.sex === "M" ? "Masculin" : "—"], ["Date de naissance", p.birthDate ? dateFmt.format(p.birthDate) : "—"],
        ["Téléphone", p.phone ?? "—"], ["Adresse", p.address ?? "—"], ["Dossier créé le", fmtDateTime(p.createdAt)], ["Créé par", creator ?? "—"],
      ].map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
    </dl>
  );

  return (
    <div className="space-y-5">
      <Link href="/patients" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Patients</Link>
      {sp.cree && <Alert tone="success">Dossier créé.</Alert>}
      {sp.modifie && <Alert tone="success">Modifications enregistrées.</Alert>}
      {sp.arrivee && open && <Alert tone="success">Arrivée enregistrée : le patient est dans la file d'attente. <Link href="/reception" className="font-semibold underline">Voir la file</Link></Alert>}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted">{p.patientNumber}</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{displayName(p)}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/90">
              <span className="inline-flex items-center gap-1.5"><Cake className="size-4 text-muted" aria-hidden />{age !== null ? `${age} an${age > 1 ? "s" : ""}` : "Âge inconnu"}{p.sex && ` · ${p.sex === "F" ? "Féminin" : "Masculin"}`}</span>
              {p.phone && <span className="inline-flex items-center gap-1.5"><Phone className="size-4 text-muted" aria-hidden />{p.phone}</span>}
              {p.address && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-muted" aria-hidden />{p.address}</span>}
            </div>
            {open && <div className="mt-3"><Badge tone="blue">Passage en cours : {VISIT_STATUS_LABEL[open.status]}</Badge></div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {opts && can(actor, "reception", "create") && !open && <ArrivalButton patientId={p.id} departments={opts.departments} doctors={opts.doctors}
              appointments={todayAppts.map((a) => ({ id: a.id, name: `${a.number} — ${fmtDateTime(a.scheduledAt)} — Dr ${a.doctor.lastName.toUpperCase()}` }))} />}
            {opts && can(actor, "appointments", "create") && <NewAppointment patientId={p.id} patientName={displayName(p)} doctors={opts.doctors} specialties={specs.map((x) => ({ id: x.id, name: x.name }))} />}
            {beds && <AdmitButton patientId={p.id} beds={beds} label="Admission" />}
            {activeAdmission && can(actor, "hospitalization", "view") && <Link href={`/hospitalisation/${activeAdmission.id}`} className={buttonClass("secondary")}>Voir l'hospitalisation</Link>}
            {can(actor, "patients", "update") && <Link href={`/patients/${p.id}/modifier`} className={buttonClass("secondary")}><Pencil className="size-4" />Modifier</Link>}
          </div>
        </div>
      </Card>
      <Card>
        <Tabs tabs={[
          { label: "Passages", count: p.visits.length, content: visits },
          ...(can(actor, "consultations", "view") ? [{ label: "Consultations", count: consults.length, content: consults.length === 0 ? <EmptyState title="Aucune consultation." /> : (
            <ul className="space-y-3">{consults.map((c) => (
              <li key={c.id} className="rounded-xl border border-white/15 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{c.specialty.name} — Dr {c.doctor.lastName.toUpperCase()} {c.doctor.firstName}</p>
                  <span className="flex gap-2">{c.status === "DRAFT" ? <Badge tone="amber">Brouillon</Badge> : <Badge tone="green">Signée</Badge>}{c.hidden && <Badge tone="amber">Confidentielle</Badge>}</span>
                </div>
                <p className="text-sm text-muted">{fmtDateTime(c.startedAt)}</p>
                {c.hidden ? <p className="mt-1 text-sm text-muted">Contenu réservé aux médecins de cette spécialité.</p> : <>
                  {c.diagnosis && <p className="mt-1 text-sm"><span className="text-muted">Diagnostic :</span> {c.diagnosis}</p>}
                  {c.prescriptions.length > 0 && <p className="mt-1 text-sm"><span className="text-muted">Prescription :</span> {c.prescriptions.flatMap((x) => x.items.map((i) => i.medication)).join(", ")}</p>}
                  <Link href={`/consultations/${c.id}`} className="mt-2 inline-block text-sm font-semibold text-brand-300 hover:underline">Ouvrir la consultation</Link>
                </>}
              </li>))}</ul>) }] : []),
          ...(can(actor, "appointments", "view") ? [{ label: "Rendez-vous", count: appts.length, content: appts.length === 0 ? <EmptyState title="Aucun rendez-vous." /> : (
            <ul className="space-y-2 text-sm">{appts.map((a) => <li key={a.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/15 p-3"><span><strong>{fmtDateTime(a.scheduledAt)}</strong> — Dr {a.doctor.lastName.toUpperCase()} · {a.reason} <span className="text-muted">({a.number})</span></span><Badge tone={a.status === "SCHEDULED" ? "blue" : "gray"}>{APPT_STATUS[a.status]}</Badge></li>)}</ul>) }] : []),
          ...(labs.length || can(actor, "laboratory", "view") ? [{ label: "Examens", count: labs.length, content: labs.length === 0 ? <EmptyState title="Aucun examen." /> : (
            <ul className="space-y-2 text-sm">{labs.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-3">
              <span><strong>{r.number}</strong> · {fmtDateTime(r.requestedAt)} — {r.items.map((i) => `${i.labTest.name}${r.status === "VALIDATED" && i.resultValue ? ` : ${i.resultValue} ${i.unit ?? ""}` : ""}`).join(", ")}</span>
              <span className="flex items-center gap-2"><Badge tone={r.status === "VALIDATED" ? "green" : "amber"}>{LAB_STATUS[r.status]}</Badge><Link href={`/laboratoire/${r.id}`} className="font-semibold text-brand-300 hover:underline">Ouvrir</Link></span></li>)}</ul>) }] : []),
          { label: "Documents", count: visibleDocs.length, content: visibleDocs.length === 0 ? <EmptyState title="Aucun document." /> : (
            <ul className="divide-y divide-white/10 text-sm">{visibleDocs.map((d) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><strong>{d.title}</strong> <span className="text-muted">· {d.number} · {fmtDateTime(d.createdAt)}</span></span><a href={`/fichiers/documents/${d.id}`} target="_blank" className={buttonClass("secondary", "!min-h-9")}>Ouvrir le PDF</a></li>)}</ul>) },
          { label: "Informations administratives", content: info },
        ]} />
        <p className="mt-5 border-t border-white/10 pt-4 text-xs text-muted">Les consultations, examens, hospitalisations, factures et documents s'ajouteront à ce dossier au fur et à mesure de la mise en service de leurs modules.</p>
      </Card>
    </div>
  );
}
