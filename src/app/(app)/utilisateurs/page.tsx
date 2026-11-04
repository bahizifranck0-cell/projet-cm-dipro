import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSuperAdminPage } from "@/server/auth/current";
import { listUsers } from "@/server/services/users";
import { Avatar } from "@/components/avatar";
import { Badge, PageHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";

export const metadata = { title: "Utilisateurs" };

export default async function Page() {
  const actor = await requireSuperAdminPage();
  const list = await listUsers(actor);
  type U = (typeof list)[number];
  const name = (u: U) => (u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username);
  return (
    <>
      <PageHeader title="Utilisateurs" subtitle={`${list.length} compte${list.length > 1 ? "s" : ""} de connexion`}
        actions={<Link href="/utilisateurs/nouveau" className={buttonClass()}><Plus className="size-4" />Créer un compte</Link>} />
      <DataTable rows={list} rowKey={(u) => u.id} caption="Liste des utilisateurs" empty="Aucun utilisateur."
        columns={[
          { header: "Utilisateur", mobile: "primary", cell: (u) => (
            <Link href={`/utilisateurs/${u.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
              <Avatar employeeId={u.employeeId} hasPhoto={!!u.employee?.photoPath} name={name(u)} />
              <span className="min-w-0"><span className="block truncate font-semibold">{name(u)}</span><span className="block truncate text-xs text-muted">{u.username}</span></span>
            </Link>) },
          { header: "Rôle", cell: (u) => <span className="inline-flex flex-wrap items-center gap-1.5">{u.role.name}{u.isSuperAdmin && <Badge tone="blue">Super admin</Badge>}</span> },
          { header: "Département", cell: (u) => <span className="text-ink/85">{u.department?.name ?? "—"}</span> },
          { header: "Statut", cell: (u) => (u.status === "ACTIVE" ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>) },
          { header: "Dernière connexion", mobile: "hide-mobile", cell: (u) => <span className="text-ink/85">{fmtDateTime(u.lastLoginAt)}</span> },
        ]} />
    </>
  );
}
