import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button-class";

export const metadata = { title: "Accès refusé" };
export default function Forbidden() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="glass max-w-md rounded-3xl p-8 text-center">
        <ShieldAlert className="mx-auto size-12 text-warning" />
        <h1 className="mt-4 text-xl font-semibold">Accès refusé</h1>
        <p className="mt-2 text-sm text-muted">Votre rôle ne donne pas accès à cette page. Si vous en avez besoin, demandez l'autorisation au Super Administrateur.</p>
        <Link href="/" className={buttonClass("secondary", "mt-6")}>Retour au tableau de bord</Link>
      </div>
    </main>
  );
}
