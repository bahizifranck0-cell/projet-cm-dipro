import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { listEmployees } from "@/server/services/employees";
import { Avatar } from "@/components/avatar";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";

export const metadata = { title: "Personnel" };
const STATUS = { ACTIVE: ["Actif", "green"], SUSPENDED: ["Suspendu", "amber"], LEFT: ["Parti", "gray"] } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; cree?: string }> }) {
  const actor = await requirePage("hr", "view");
  const { q, cree } = await searchParams;
  const list = await listEmployees(actor, q);
  return (
    <>
      <PageHeader title="Personnel" subtitle={`${list.length} employé${list.length > 1 ? "s" : ""}`}
        actions={can(actor, "hr", "create") && <Link href="/personnel/nouveau" className={buttonClass()}><Plus className="size-4" />Nouvel employé</Link>} />
      {cree && <p role="status" className="mb-4 rounded-xl border border-success/50 bg-success/10 px-3 py-2 text-sm text-[#b5f5d8]">Employé enregistré.</p>}
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Rechercher : nom, prénom, matricule" className="field min-w-0 max-w-md" aria-label="Rechercher un employé" />
        <button className={buttonClass("secondary", "shrink-0")} aria-label="Rechercher"><Search className="size-4" /><span className="hidden sm:inline">Rechercher</span></button>
      </form>
      {list.length === 0 ? (
        <EmptyState title={q ? "Aucun employé trouvé." : "Aucun employé enregistré."} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((e) => {
            const name = `${e.firstName} ${e.lastName}`;
            const [label, tone] = STATUS[e.status];
            return (
              <Card key={e.id} className="flex min-w-0 items-center gap-4 !p-4">
                <Avatar employeeId={e.id} hasPhoto={!!e.photoPath} name={name} size={52} />
                <div className="min-w-0 flex-1">
                  <Link href={`/personnel/${e.id}`} className="block truncate font-semibold hover:underline">{e.lastName.toUpperCase()} {e.postName ?? ""} {e.firstName}</Link>
                  <p className="truncate text-sm text-muted">{e.position}{e.department ? ` · ${e.department.name}` : ""}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5"><Badge tone={tone}>{label}</Badge><Badge>{e.matricule}</Badge>{e.user && <Badge tone="blue">Compte : {e.user.username}</Badge>}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
