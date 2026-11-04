import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { getSpecialty } from "@/server/services/specialties";
import { listDepartments } from "@/server/services/departments";
import { db } from "@/server/db";
import { Avatar } from "@/components/avatar";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { AssignDoctor, EndAssignment, FormBuilder, SpecialtyForm, ToggleSpecialty } from "../forms";

export const metadata = { title: "Spécialité" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("settings", "view");
  const s = await getSpecialty((await params).id);
  if (!s) notFound();
  const edit = can(actor, "settings", "update");
  const deps = (await listDepartments(true)).map((d) => ({ id: d.id, name: d.name }));
  const active = s.assignments.filter((a) => a.active);
  const candidates = edit ? await db.employee.findMany({ where: { status: "ACTIVE", id: { notIn: active.map((a) => a.employeeId) } }, orderBy: { lastName: "asc" } }) : [];
  return (
    <div className="space-y-5">
      <Link href="/parametres/specialites" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Spécialités</Link>
      <PageHeader title={s.name} actions={<>{!s.active && <Badge tone="red">Désactivée</Badge>}{s.confidential && <Badge tone="amber">Confidentielle</Badge>}</>} />
      {edit && <Card><SpecialtyForm id={s.id} departments={deps} initial={{ name: s.name, description: s.description, confidential: s.confidential, departmentIds: s.departments.map((d) => d.departmentId) }} /><div className="mt-4 border-t border-white/10 pt-4"><ToggleSpecialty id={s.id} active={s.active} /></div></Card>}
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Médecins affectés</h2>
        {active.length === 0 ? <EmptyState title="Aucun médecin affecté." /> : (
          <ul className="mb-4 divide-y divide-white/10">{active.map((a) => {
            const name = `Dr ${a.employee.lastName.toUpperCase()} ${a.employee.firstName}`;
            return (<li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar employeeId={a.employee.id} hasPhoto={!!a.employee.photoPath} name={name} />
              <span className="min-w-0 flex-1"><span className="block font-medium">{name}</span><span className="text-xs text-muted">{a.department?.name ?? "Tous services de la spécialité"}</span></span>
              {edit && <EndAssignment specialtyId={s.id} assignmentId={a.id} name={name} />}
            </li>);
          })}</ul>
        )}
        {edit && s.active && <AssignDoctor specialtyId={s.id} departments={deps} employees={candidates.map((e) => ({ id: e.id, name: `${e.lastName.toUpperCase()} ${e.firstName} — ${e.position}` }))} />}
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Formulaire de consultation</h2>
        {edit ? <FormBuilder specialtyId={s.id} initial={(s.form?.fields ?? []) as never} validated={s.form?.validated ?? false} version={s.form?.version ?? null} />
          : <p className="text-sm text-muted">{s.form ? `Version ${s.form.version}` : "Aucun formulaire spécifique."}</p>}
      </Card>
    </div>
  );
}
