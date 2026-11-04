import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/current";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";
import { DemoPanel } from "./demo-panel";
import { DEMO_MAIN, DEMO_OTHERS, DEMO_PASSWORD, isDemo } from "@/lib/demo";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getActor()) redirect("/");
  const demoUrl = process.env.CMDPRO_DEMO_URL; // lien vers l'instance de démonstration (base séparée)
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="glass rounded-3xl p-6 sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo size={148} priority />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Connexion à CMD Pro{isDemo() && " — démonstration"}</h1>
            <p className="mt-1 text-sm text-muted">Centre Médical Dieu est Fidélité — Goma</p>
          </div>
          <LoginForm />
        </div>
        {isDemo() && <DemoPanel main={DEMO_MAIN} others={DEMO_OTHERS} password={DEMO_PASSWORD} />}
        {!isDemo() && demoUrl && (
          <p className="mt-5 text-center text-sm text-muted">
            Découvrir le logiciel avec des données fictives :{" "}
            <a href={demoUrl} className="font-semibold text-brand-300 underline-offset-4 hover:underline">accès à la démonstration</a>
          </p>
        )}
        <p className="mt-4 text-center text-xs text-muted/80">Accès réservé au personnel autorisé. Toutes les connexions sont enregistrées.</p>
      </div>
    </main>
  );
}
