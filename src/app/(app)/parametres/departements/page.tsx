import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { listDepartments } from "@/server/services/departments";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { DepartmentRow, NewDepartment } from "./forms";

export const metadata = { title: "Départements" };
export default async function Page() {
  const actor = await requirePage("settings", "view");
  const canEdit = can(actor, "settings", "update");
  const list = await listDepartments();
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Départements et services" subtitle="Liste à établir par l'hôpital : aucun département n'est créé d'office." />
      {canEdit && <Card><NewDepartment /></Card>}
      <Card>
        {list.length === 0 ? <EmptyState title="Aucun département enregistré." /> : (
          <div className="divide-y divide-white/10">
            {list.map((d) => (
              <div key={d.id} className={d.active ? "" : "opacity-60"}>
                {!d.active && <Badge tone="red">Désactivé</Badge>}
                <DepartmentRow id={d.id} name={d.name} active={d.active} canEdit={canEdit} counts={`${d._count.employees} employé(s) · ${d._count.users} compte(s)`} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
