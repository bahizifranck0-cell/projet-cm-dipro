import { requireActor } from "@/server/auth/current";
import { listNotifications } from "@/server/services/notifications";
import { moduleText, fmtDateTime } from "@/lib/labels";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { ActionButton } from "@/components/billing/billing-forms";
import { markAllReadAction } from "./actions";

export const metadata = { title: "Notifications" };
export default async function Page() {
  const actor = await requireActor();
  const list = await listNotifications(actor, { take: 200 });
  const unread = list.filter((n) => !n.readAt).length;
  return (<>
    <PageHeader title="Notifications" subtitle={unread ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est lu"} actions={unread > 0 && <ActionButton action={markAllReadAction} label="Tout marquer comme lu" />} />
    {list.length === 0 ? <EmptyState title="Aucune notification." /> : (
      <ul className="space-y-2">{list.map((n) => (
        <li key={n.id}><a href={`/notifications/${n.id}`} className={`glass flex flex-wrap items-start gap-3 rounded-2xl p-4 hover:border-white/35 ${n.readAt ? "opacity-70" : "border-l-4 border-l-brand-400"}`}>
          <div className="min-w-0 flex-1"><p className="font-semibold">{n.title}</p>{n.body && <p className="text-sm text-ink/85">{n.body}</p>}<p className="mt-1 text-xs text-muted">{moduleText(n.module)} · {fmtDateTime(n.createdAt)}</p></div>
          {!n.readAt && <Badge tone="blue">Nouveau</Badge>}
        </a></li>))}</ul>
    )}
  </>);
}
