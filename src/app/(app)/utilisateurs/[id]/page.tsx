import { notFound } from "next/navigation";
import { requireSuperAdminPage } from "@/server/auth/current";
import { getUserDetail } from "@/server/services/users";
import { listRoles } from "@/server/services/roles";
import { listDepartments } from "@/server/services/departments";
import { Avatar } from "@/components/avatar";
import { Badge, Card } from "@/components/ui/card";
import { actionText, fmtDateTime, moduleText } from "@/lib/labels";
import { ManageUser } from "./manage";

export const metadata = { title: "Fiche utilisateur" };

// Fond « carnet » : lignes réglées + marge.
const ruled = {
  backgroundImage: "linear-gradient(90deg, transparent 38px, rgba(255,120,140,0.35) 38px, rgba(255,120,140,0.35) 39px, transparent 39px), repeating-linear-gradient(180deg, transparent 0, transparent 35px, rgba(255,255,255,0.08) 35px, rgba(255,255,255,0.08) 36px)",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSuperAdminPage();
  const { id } = await params;
  const [d, roles, deps] = await Promise.all([getUserDetail(actor, id), listRoles(), listDepartments(true)]);
  if (!d) notFound();
  const { user, logins, actions, modules } = d;
  const name = user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.username;

  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <Avatar employeeId={user.employeeId} hasPhoto={!!user.employee?.photoPath} name={name} size={96} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-muted">{user.username}{user.employee ? ` · ${user.employee.position}` : ""}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Badge tone="blue">{user.role.name}</Badge>
            <Badge>{user.department?.name ?? "Sans département"}</Badge>
            {user.status === "ACTIVE" ? <Badge tone="green">Compte actif</Badge> : <Badge tone="red">Compte désactivé</Badge>}
            {user.mustChangePassword && <Badge tone="amber">Mot de passe provisoire</Badge>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
          <dt className="text-muted">Créé le</dt><dd>{fmtDateTime(user.createdAt)}</dd>
          <dt className="text-muted">Dernière connexion</dt><dd>{fmtDateTime(user.lastLoginAt)}</dd>
        </dl>
      </Card>

      {/* Carnet ouvert : connexions à gauche, actions à droite */}
      <div className="glass grid overflow-hidden rounded-3xl lg:grid-cols-2">
        <section className="border-white/15 p-5 lg:border-r-4 lg:border-double" style={ruled}>
          <h2 className="mb-3 pl-12 font-semibold">Historique des connexions</h2>
          <ul className="space-y-0 pl-12 text-sm leading-9">
            {logins.length === 0 && <li className="text-muted">Aucune connexion enregistrée.</li>}
            {logins.map((l) => (
              <li key={String(l.id)} className="flex justify-between gap-3">
                <span className={l.action.includes("FAILED") || l.action.includes("REFUSED") || l.action.includes("BLOCKED") ? "text-danger" : ""}>{actionText(l.action)}</span>
                <span className="shrink-0 text-muted">{fmtDateTime(l.at)}</span>
              </li>
            ))}
          </ul>
          {modules.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 pl-12 font-semibold">Modules utilisés</h2>
              <div className="flex flex-wrap gap-2 pl-12">{modules.map((m) => <Badge key={m.module}>{moduleText(m.module)} · {m.count}</Badge>)}</div>
            </>
          )}
        </section>
        <section className="border-t border-white/15 p-5 lg:border-t-0" style={ruled}>
          <h2 className="mb-3 pl-12 font-semibold">Actions effectuées</h2>
          <ul className="pl-12 text-sm leading-9">
            {actions.length === 0 && <li className="text-muted">Aucune action enregistrée.</li>}
            {actions.map((a) => (
              <li key={String(a.id)} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{actionText(a.action)} — {moduleText(a.module)}{a.entityType ? ` (${a.entityType})` : ""}</span>
                <span className="shrink-0 text-muted">{fmtDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Card>
        <ManageUser id={user.id} roleId={user.roleId} departmentId={user.departmentId} status={user.status} isSuperAdmin={user.isSuperAdmin} isSelf={user.id === actor.userId}
          roles={roles.filter((r) => r.active && (user.isSuperAdmin || r.code !== "SUPER_ADMIN")).map((r) => ({ id: r.id, name: r.name }))}
          departments={deps.map((x) => ({ id: x.id, name: x.name }))} />
      </Card>
    </div>
  );
}
