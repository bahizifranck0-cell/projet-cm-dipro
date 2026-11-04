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
  const opts = can(actor, "reception", "create") && !open ? await orientationOptions() : null;

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
            {opts && <ArrivalButton patientId={p.id} departments={opts.departments} doctors={opts.doctors} />}
            {can(actor, "patients", "update") && <Link href={`/patients/${p.id}/modifier`} className={buttonClass("secondary")}><Pencil className="size-4" />Modifier</Link>}
          </div>
        </div>
      </Card>
      <Card>
        <Tabs tabs={[
          { label: "Passages", count: p.visits.length, content: visits },
          { label: "Informations administratives", content: info },
        ]} />
        <p className="mt-5 border-t border-white/10 pt-4 text-xs text-muted">Les consultations, examens, hospitalisations, factures et documents s'ajouteront à ce dossier au fur et à mesure de la mise en service de leurs modules.</p>
      </Card>
    </div>
  );
}
