import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSuperAdminPage } from "@/server/auth/current";
import { getRole } from "@/server/services/roles";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { PermissionMatrix } from "./matrix";
import { RoleForms } from "./role-forms";

export const metadata = { title: "Rôle" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdminPage();
  const role = await getRole((await params).id);
  if (!role) notFound();
  const isSuper = role.code === "SUPER_ADMIN";
  return (
    <div className="space-y-5">
      <Link href="/parametres/roles" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Tous les rôles</Link>
      <PageHeader title={role.name} subtitle={`${role._count.users} utilisateur${role._count.users > 1 ? "s" : ""}`}
        actions={<>{!role.active && <Badge tone="red">Désactivé</Badge>}{role.isSystem && <Badge>Rôle de base</Badge>}</>} />
      <Card><RoleForms id={role.id} name={role.name} description={role.description} active={role.active} deletable={!role.isSystem && role._count.users === 0} locked={isSuper} /></Card>
      <Card>
        <h2 className="mb-3 font-semibold">Permissions</h2>
        {isSuper ? <p className="text-sm text-muted">Le Super Administrateur a accès à l'ensemble du système ; ses permissions ne se modifient pas.</p>
          : <PermissionMatrix roleId={role.id} initial={role.permissionKeys} />}
      </Card>
    </div>
  );
}
