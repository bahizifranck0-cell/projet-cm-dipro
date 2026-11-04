import Link from "next/link";
import { requireSuperAdminPage } from "@/server/auth/current";
import { employeesWithoutAccount } from "@/server/services/employees";
import { listRoles } from "@/server/services/roles";
import { listDepartments } from "@/server/services/departments";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { UserForm } from "./form";

export const metadata = { title: "Nouveau compte" };
export default async function Page() {
  const actor = await requireSuperAdminPage();
  const [emps, roles, deps] = await Promise.all([employeesWithoutAccount(actor), listRoles(), listDepartments(true)]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Créer un compte utilisateur" subtitle="À partir d'un employé déjà enregistré" />
      <Card>
        {emps.length === 0 ? (
          <EmptyState title="Aucun employé sans compte.">
            <p className="mb-4">Enregistrez d'abord l'employé dans le module Personnel.</p>
            <Link href="/personnel/nouveau" className={buttonClass("secondary")}>Nouvel employé</Link>
          </EmptyState>
        ) : (
          <UserForm
            employees={emps.map((e) => ({ id: e.id, name: `${e.lastName.toUpperCase()} ${e.firstName}`, matricule: e.matricule, position: e.position, departmentId: e.departmentId, departmentName: e.department?.name ?? null, hasPhoto: !!e.photoPath }))}
            roles={roles.filter((r) => r.active && r.code !== "SUPER_ADMIN").map((r) => ({ id: r.id, name: r.name }))}
            departments={deps.map((d) => ({ id: d.id, name: d.name }))} />
        )}
      </Card>
    </div>
  );
}
