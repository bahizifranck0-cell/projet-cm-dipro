import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { bedBoard } from "@/server/services/hospitalization";
import { listDepartments } from "@/server/services/departments";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { BedForm, BedService, RoomForm } from "@/components/medical/hospital-forms";

export const metadata = { title: "Chambres et lits" };
export default async function Page() {
  const actor = await requirePage("hospitalization", "view");
  const [rooms, deps] = await Promise.all([bedBoard(), listDepartments(true)]);
  const create = can(actor, "hospitalization", "create"), update = can(actor, "hospitalization", "update");
  return (
    <div className="space-y-5">
      <PageHeader title="Chambres et lits" />
      <Alert tone="info">Le nombre et les catégories de chambres sont à saisir selon la réalité de l'hôpital : aucune chambre n'est créée d'office.</Alert>
      {create && <Card><h2 className="mb-3 text-lg font-semibold">Nouvelle chambre</h2><RoomForm departments={deps.map((d) => ({ id: d.id, name: d.name }))} /></Card>}
      {rooms.length === 0 ? <EmptyState title="Aucune chambre." /> : rooms.map((r) => (
        <Card key={r.id}>
          <h2 className="font-semibold">{r.code} — {r.name} <span className="text-sm font-normal text-muted">· {r.category}{r.department ? ` · ${r.department.name}` : ""}</span></h2>
          <ul className="my-3 flex flex-wrap gap-2">{r.beds.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-xl border border-white/20 px-3 py-1.5 text-sm">
              Lit {b.code} <Badge tone={b.status === "AVAILABLE" ? "green" : b.status === "OCCUPIED" ? "blue" : "gray"}>{b.status === "AVAILABLE" ? "Libre" : b.status === "OCCUPIED" ? "Occupé" : "Hors service"}</Badge>
              {update && b.status !== "OCCUPIED" && <BedService bedId={b.id} out={b.status === "AVAILABLE"} label={`le lit ${b.code} de ${r.code}`} />}
            </li>))}</ul>
          {create && <BedForm roomId={r.id} roomCode={r.code} />}
        </Card>
      ))}
    </div>
  );
}
