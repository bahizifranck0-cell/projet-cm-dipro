import Link from "next/link";
import { requirePage } from "@/server/auth/current";
import { listAudit } from "@/server/services/audit";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-class";
import { actionText, fmtDateTime, moduleText } from "@/lib/labels";

export const metadata = { title: "Journal d'audit" };
const PAGE = 50;

export default async function Page({ searchParams }: { searchParams: Promise<{ module?: string; avant?: string }> }) {
  await requirePage("audit", "view");
  const { module, avant } = await searchParams;
  const cursor = avant && /^\d+$/.test(avant) ? BigInt(avant) : undefined;
  const rows = await listAudit({ module: module || undefined, take: PAGE, cursor });
  const modules = ["auth", "users", "roles", "hr", "settings"];
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="Toutes les opérations importantes. Ce journal ne peut être ni modifié ni effacé." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/parametres/journal" className={buttonClass(module ? "ghost" : "secondary", "!py-1.5")} aria-current={!module ? "page" : undefined}>Tout</Link>
        {modules.map((m) => <Link key={m} href={`?module=${m}`} className={buttonClass(module === m ? "secondary" : "ghost", "!py-1.5")} aria-current={module === m ? "page" : undefined}>{moduleText(m)}</Link>)}
      </div>
      <Card className="!p-0">
        {rows.length === 0 ? <div className="p-5"><EmptyState title="Aucune opération." /></div> : (
          <ul className="divide-y divide-white/10">
            {rows.map((r) => {
              const who = r.user ? (r.user.employee ? `${r.user.employee.firstName} ${r.user.employee.lastName}` : r.user.username) : "Système / inconnu";
              return (
                <li key={String(r.id)} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[150px_1fr_1fr] sm:gap-4">
                  <span className="text-muted">{fmtDateTime(r.at)}</span>
                  <span><span className="font-medium">{actionText(r.action)}</span> · {moduleText(r.module)}{r.entityType ? <span className="text-muted"> · {r.entityType}</span> : null}</span>
                  <span className="text-muted">{who}{r.ip ? ` · ${r.ip}` : ""}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {rows.length === PAGE && (
        <div className="mt-4 text-center">
          <Link href={`?${new URLSearchParams({ ...(module ? { module } : {}), avant: String(rows[rows.length - 1].id) })}`} className={buttonClass("secondary")}>Opérations plus anciennes</Link>
        </div>
      )}
    </>
  );
}
