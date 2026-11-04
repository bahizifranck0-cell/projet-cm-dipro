import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireSuperAdminPage } from "@/server/auth/current";
import { listRoles } from "@/server/services/roles";
import { Badge, PageHeader } from "@/components/ui/card";
import { NewRole } from "./new-role";

export const metadata = { title: "Rôles et permissions" };
export default async function Page() {
  await requireSuperAdminPage();
  const roles = await listRoles();
  return (
    <>
      <PageHeader title="Rôles et permissions" subtitle="Cochez ce que chaque rôle peut faire, module par module." actions={<NewRole />} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {roles.map((r) => (
          <Link key={r.id} href={`/parametres/roles/${r.id}`} className="glass group flex items-center gap-4 rounded-2xl p-4 hover:border-white/35">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">{r.name}{!r.active && <Badge tone="red">Désactivé</Badge>}{r.isSystem && <Badge>Rôle de base</Badge>}</p>
              {r.description && <p className="mt-0.5 truncate text-sm text-muted">{r.description}</p>}
              <p className="mt-1.5 text-xs text-muted">{r.code === "SUPER_ADMIN" ? "Accès complet" : `${r._count.permissions} permission${r._count.permissions > 1 ? "s" : ""}`} · {r._count.users} utilisateur{r._count.users > 1 ? "s" : ""}</p>
            </div>
            <ChevronRight className="size-5 text-muted group-hover:text-ink" />
          </Link>
        ))}
      </div>
    </>
  );
}
