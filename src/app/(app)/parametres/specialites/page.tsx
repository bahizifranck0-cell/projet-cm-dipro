import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { listSpecialties } from "@/server/services/specialties";
import { listDepartments } from "@/server/services/departments";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { SpecialtyForm } from "./forms";

export const metadata = { title: "Spécialités médicales" };
export default async function Page() {
  const actor = await requirePage("settings", "view");
  const [list, deps] = await Promise.all([listSpecialties(), listDepartments(true)]);
  return (
    <div className="space-y-5">
      <PageHeader title="Spécialités médicales" subtitle="Liste dynamique : ajoutez une spécialité sans modifier le logiciel." />
      <Alert tone="info">La liste définitive des spécialités et des médecins reste à fournir par l'hôpital. Aucune spécialité n'est créée d'office.</Alert>
      {can(actor, "settings", "update") && <Card><h2 className="mb-3 text-lg font-semibold">Nouvelle spécialité</h2><SpecialtyForm departments={deps.map((d) => ({ id: d.id, name: d.name }))} /></Card>}
      {list.length === 0 ? <EmptyState title="Aucune spécialité enregistrée." /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((s) => (
            <Link key={s.id} href={`/parametres/specialites/${s.id}`} className="glass group flex items-center gap-4 rounded-2xl p-4 hover:border-white/35">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{s.name}{!s.active && <Badge tone="red">Désactivée</Badge>}{s.confidential && <Badge tone="amber">Confidentielle</Badge>}</p>
                <p className="mt-1 text-sm text-muted">{s.assignments.length} médecin{s.assignments.length > 1 ? "s" : ""} · {s._count.consultations} consultation{s._count.consultations > 1 ? "s" : ""}{s.departments.length ? ` · ${s.departments.map((d) => d.department.name).join(", ")}` : ""}</p>
              </div>
              <ChevronRight className="size-5 text-muted" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
