import { requirePage } from "@/server/auth/current";
import { listDepartments } from "@/server/services/departments";
import { Card, PageHeader } from "@/components/ui/card";
import { EmployeeForm } from "./form";

export const metadata = { title: "Nouvel employé" };
export default async function Page() {
  await requirePage("hr", "create");
  const deps = await listDepartments(true);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nouvel employé" subtitle="Dossier individuel du personnel" />
      <Card><EmployeeForm departments={deps.map((d) => ({ id: d.id, name: d.name }))} /></Card>
    </div>
  );
}
