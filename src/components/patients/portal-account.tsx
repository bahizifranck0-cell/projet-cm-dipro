"use client";
import { useActionToast } from "@/components/ui/toast";
import { portalAccountAction, portalResetAction, portalStatusAction } from "@/app/(app)/patients/actions";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";

export function PortalAccount({ patientId, account }: { patientId: string; account: { username: string; status: string; lastLoginAt: string | null } | null }) {
  const [s1, create] = useActionToast(portalAccountAction.bind(null, patientId));
  const [s2, toggle] = useActionToast(portalStatusAction.bind(null, patientId, account?.status === "ACTIVE" ? "DISABLED" : "ACTIVE"));
  const [s3, reset] = useActionToast(portalResetAction.bind(null, patientId));
  if (!account) return (<form action={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
    <Field label="Identifiant du patient" name="username" state={s1}><Input name="username" required autoCapitalize="none" state={s1} /></Field>
    <Field label="Mot de passe provisoire" name="password" state={s1} hint="À changer à la première connexion."><Input name="password" required autoComplete="off" state={s1} /></Field>
    <SubmitButton variant="secondary">Créer l&apos;accès</SubmitButton><div className="sm:col-span-3"><FormMessage state={s1} /></div>
  </form>);
  return (<div className="space-y-3 text-sm">
    <p>Identifiant : <strong>{account.username}</strong> <Badge tone={account.status === "ACTIVE" ? "green" : "red"}>{account.status === "ACTIVE" ? "Actif" : "Désactivé"}</Badge>{account.lastLoginAt && <span className="text-muted"> · dernière connexion {account.lastLoginAt}</span>}</p>
    <div className="flex flex-wrap items-end gap-3">
      <form action={reset} className="flex flex-wrap items-end gap-2"><Field label="Nouveau mot de passe provisoire" name="password" state={s3}><Input name="password" required autoComplete="off" state={s3} /></Field><SubmitButton variant="secondary">Réinitialiser</SubmitButton></form>
      <form action={toggle}><SubmitButton variant={account.status === "ACTIVE" ? "danger" : "primary"}>{account.status === "ACTIVE" ? "Désactiver l'accès" : "Réactiver l'accès"}</SubmitButton></form>
    </div>
    <FormMessage state={s2} /><FormMessage state={s3} />
  </div>);
}
