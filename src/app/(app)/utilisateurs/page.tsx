import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSuperAdminPage } from "@/server/auth/current";
import { listUsers } from "@/server/services/users";
import { Avatar } from "@/components/avatar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Utilisateurs" };

export default async function Page() {
  const actor = await requireSuperAdminPage();
  const list = await listUsers(actor);
  const name = (u: (typeof list)[number]) => (u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username);
  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Comptes de connexion du personnel"
        actions={<Link href="/utilisateurs/nouveau" className={buttonClass()}><Plus className="size-4" />Créer un compte</Link>} />
      {list.length === 0 ? <EmptyState title="Aucun utilisateur." /> : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead className="hidden bg-white/5 text-left text-xs tracking-wide text-muted uppercase md:table-header-group">
              <tr><th className="px-4 py-3">Utilisateur</th><th className="px-4 py-3">Rôle</th><th className="px-4 py-3">Département</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Dernière connexion</th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {list.map((u) => (
                <tr key={u.id} className="relative flex flex-col gap-1 px-4 py-3 hover:bg-white/5 md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <Link href={`/utilisateurs/${u.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                      <Avatar employeeId={u.employeeId} hasPhoto={!!u.employee?.photoPath} name={name(u)} />
                      <span className="min-w-0"><span className="block truncate font-semibold">{name(u)}</span><span className="block truncate text-xs text-muted">{u.username}</span></span>
                    </Link>
                  </td>
                  <td className="pl-[52px] md:px-4 md:py-3">{u.role.name}{u.isSuperAdmin && <Badge tone="blue">Super admin</Badge>}</td>
                  <td className="pl-[52px] text-muted md:px-4 md:py-3">{u.department?.name ?? "—"}</td>
                  <td className="pl-[52px] md:px-4 md:py-3">{u.status === "ACTIVE" ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}</td>
                  <td className="hidden text-muted md:table-cell md:px-4 md:py-3">{fmtDateTime(u.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
