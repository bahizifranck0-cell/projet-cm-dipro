import { redirect } from "next/navigation";
import { getPortalSession } from "@/server/portal/session";
import { Logo } from "@/components/logo";
import { PortalLogin } from "../forms";

export const metadata = { title: "Mon dossier patient" };
export default async function Page() {
  if (await getPortalSession()) redirect("/portail");
  return (<main className="flex min-h-dvh items-center justify-center px-4 py-10"><div className="w-full max-w-md"><div className="glass rounded-3xl p-6 sm:p-8">
    <div className="mb-6 flex flex-col items-center text-center"><Logo size={120} priority /><h1 className="mt-5 text-2xl font-semibold">Mon dossier patient</h1><p className="mt-1 text-sm text-muted">Centre Médical Dieu est Fidélité — Goma</p></div>
    <PortalLogin />
    <p className="mt-5 text-center text-xs text-muted">Votre identifiant vous est remis par l&apos;accueil de l&apos;hôpital.</p>
  </div></div></main>);
}
