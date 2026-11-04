import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/current";
import { db } from "@/server/db";

// Ouvre une notification : marquée comme lue puis redirection vers l'élément concerné.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/connexion");
  const n = await db.notification.findFirst({ where: { id: (await params).id, recipientUserId: actor.userId } });
  if (!n) redirect("/notifications");
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  redirect(n.link && n.link.startsWith("/") ? n.link : "/notifications");
}
