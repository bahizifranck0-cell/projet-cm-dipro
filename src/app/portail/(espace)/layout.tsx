import Link from "next/link";
import { LogOut } from "lucide-react";
import { requirePortal } from "@/server/portal/session";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { Logo } from "@/components/logo";
import { portalLogoutAction } from "../actions";

const NAV = [["/portail", "Accueil"], ["/portail#consultations", "Consultations"], ["/portail#examens", "Examens"], ["/portail#rendez-vous", "Rendez-vous"], ["/portail#factures", "Factures"], ["/portail#documents", "Documents"]] as const;
export default async function Layout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-cmdpro-path") ?? "";
  const s = await requirePortal(path.startsWith("/portail/mot-de-passe"));
  const p = await db.patient.findUniqueOrThrow({ where: { id: s.patientId }, select: { firstName: true, lastName: true, patientNumber: true } });
  return (<div className="mx-auto min-h-dvh max-w-3xl px-4 pb-10">
    <header className="glass-solid sticky top-0 z-30 -mx-4 mb-5 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-2">
      <Logo size={38} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.firstName} {p.lastName.toUpperCase()}</p><p className="text-xs text-muted">{p.patientNumber}</p></div>
      <form action={portalLogoutAction}><button aria-label="Se déconnecter" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-[#ffd0d5] hover:bg-danger/15"><LogOut className="size-5" /><span className="hidden sm:inline">Se déconnecter</span></button></form>
    </header>
    <nav aria-label="Rubriques" className="scroll-area -mx-1 mb-5 flex gap-2 px-1 pb-1">{NAV.map(([h, l]) => <Link key={h} href={h} className="shrink-0 rounded-xl border border-white/20 px-3 py-2 text-sm hover:bg-white/10">{l}</Link>)}</nav>
    <main id="contenu">{children}</main>
    <p className="mt-8 text-center text-xs text-muted"><Link href="/portail/mot-de-passe" className="underline">Changer mon mot de passe</Link></p>
  </div>);
}
