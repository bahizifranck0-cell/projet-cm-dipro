import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { navFor, notificationTotal } from "@/components/nav";
import { NotificationBell } from "@/components/notification-bell";
import { Sidebar } from "@/components/sidebar";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import { ToastProvider } from "@/components/ui/toast";
import { db } from "@/server/db";
import { unreadCounts } from "@/server/services/notifications";
import { isDemo } from "@/lib/demo";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  // Mot de passe provisoire : changement obligatoire avant tout accès.
  const path = (await headers()).get("x-cmdpro-path") ?? "";
  if (actor.mustChangePassword && !path.startsWith("/compte/mot-de-passe")) redirect("/compte/mot-de-passe");

  const counts = await unreadCounts(actor);
  const photo = actor.employeeId ? await db.employee.findUnique({ where: { id: actor.employeeId }, select: { photoPath: true } }) : null;

  return (
    <ToastProvider>
      <a href="#contenu" className="sr-only z-[70] rounded-lg bg-white px-3 py-2 text-brand-900 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Aller au contenu</a>
      <div className="md:flex">
        <Sidebar items={navFor(actor, counts)} bell={<NotificationBell count={notificationTotal(counts)} />} logo={<Logo size={40} />} logoutAction={logoutAction}
          user={{ name: actor.displayName, role: actor.roleName, employeeId: actor.employeeId, avatar: <Avatar employeeId={actor.employeeId} hasPhoto={!!photo?.photoPath} name={actor.displayName} size={36} /> }} />
        <main id="contenu" className="pb-bottom-nav min-w-0 flex-1 px-4 pt-5 sm:px-6 md:pt-6 lg:px-10 lg:pt-8">
          {/* En-tête principal (tablette et ordinateur) : cloche des notifications en haut à droite, visible sur tous les modules. */}
          <header className="pointer-events-none sticky top-4 z-30 mx-auto -mb-2 hidden max-w-7xl justify-end md:flex lg:top-6">
            <div className="pointer-events-auto"><NotificationBell count={notificationTotal(counts)} /></div>
          </header>
          {isDemo() && <p role="note" className="mx-auto mb-4 max-w-7xl rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-center text-sm text-[#ffe7b3]">Démonstration : toutes les données sont fictives.</p>}
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
