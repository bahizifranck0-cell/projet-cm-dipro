import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { navFor } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import { ToastProvider } from "@/components/ui/toast";
import { db } from "@/server/db";
import { unreadCounts } from "@/server/services/notifications";
import { isDemo } from "@/lib/demo";
import { logoutAction } from "./actions";
import { ReviewOverlay } from "@/components/review-overlay";
import { reviewEnabled } from "@/server/services/reviews";

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
        <Sidebar items={navFor(actor, counts)} logo={<Logo size={40} />} logoutAction={logoutAction}
          user={{ name: actor.displayName, role: actor.roleName, employeeId: actor.employeeId, avatar: <Avatar employeeId={actor.employeeId} hasPhoto={!!photo?.photoPath} name={actor.displayName} size={36} /> }} />
        <main id="contenu" className="pb-bottom-nav min-w-0 flex-1 px-4 pt-5 sm:px-6 md:pt-6 lg:px-10 lg:pt-8">
          {isDemo() && <p role="note" className="mx-auto mb-4 max-w-7xl rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-center text-sm text-[#ffe7b3]">Démonstration : toutes les données sont fictives.</p>}
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      {reviewEnabled() && <ReviewOverlay />}
    </ToastProvider>
  );
}
