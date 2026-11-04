import { requireActor } from "@/server/auth/current";
import { Card, PageHeader } from "@/components/ui/card";
import { PasswordForm } from "./form";

export const metadata = { title: "Mot de passe" };
export default async function Page() {
  const actor = await requireActor();
  return (
    <div className="max-w-lg">
      <PageHeader title="Mot de passe" subtitle={actor.username} />
      <Card><PasswordForm forced={!!actor.mustChangePassword} /></Card>
    </div>
  );
}
