import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { ageFrom, displayName, searchPatients } from "@/server/services/patients";
import { Badge, PageHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { buttonClass } from "@/components/ui/button-class";

export const metadata = { title: "Patients" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePage("patients", "view");
  const { q = "" } = await searchParams;
  const rows = await searchPatients(actor, q);
  return (
    <>
      <PageHeader title="Patients" subtitle={q ? `${rows.length} résultat${rows.length > 1 ? "s" : ""} pour « ${q} »` : "Dossiers récemment créés"}
        actions={can(actor, "patients", "create") && <Link href="/patients/nouveau" className={buttonClass()}><Plus className="size-4" />Nouveau dossier</Link>} />
      <form role="search" className="mb-5 flex gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xl">
          <span className="sr-only">Rechercher un patient</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" defaultValue={q} autoFocus placeholder="Nom, téléphone ou numéro de dossier" className="field pl-10 text-base" />
        </label>
        <button className={buttonClass("secondary", "shrink-0")}>Rechercher</button>
      </form>
      <DataTable rows={rows} rowKey={(p) => p.id} caption="Patients"
        empty={q ? "Aucun patient trouvé. Vérifiez l'orthographe ou cherchez par téléphone." : "Aucun dossier patient pour l'instant."}
        columns={[
          { header: "Patient", mobile: "primary", cell: (p) => (
            <Link href={`/patients/${p.id}`} className="block after:absolute after:inset-0">
              <span className="block font-semibold">{displayName(p)}</span>
              <span className="block text-xs text-muted">{p.patientNumber}</span>
            </Link>) },
          { header: "Âge / sexe", cell: (p) => { const a = ageFrom(p.birthDate); return <span>{a !== null ? `${a} an${a > 1 ? "s" : ""}` : "—"}{p.sex ? ` · ${p.sex === "F" ? "F" : "M"}` : ""}</span>; } },
          { header: "Téléphone", cell: (p) => p.phone ?? "—" },
          { header: "Passage", cell: (p) => (p.visits.length ? <Badge tone="blue">En cours</Badge> : <span className="text-muted">—</span>) },
        ]} />
    </>
  );
}
