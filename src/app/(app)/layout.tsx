import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { navFor } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { Logo } from "@/components/logo";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  // Mot de passe provisoire : changement obligatoire avant tout accès.
  const path = (await headers()).get("x-cmdpro-path") ?? "";
  if (actor.mustChangePassword && !path.startsWith("/compte/mot-de-passe")) redirect("/compte/mot-de-passe");

  return (
    <div className="lg:flex">
      <Sidebar items={navFor(actor)} user={{ name: actor.displayName, role: actor.roleName }} logo={<Logo size={40} />} logoutAction={logoutAction} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
