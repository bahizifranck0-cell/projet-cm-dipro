import { requirePortal } from "@/server/portal/session";
import { Card } from "@/components/ui/card";
import { PortalPassword } from "../../forms";
export const metadata = { title: "Mot de passe" };
export default async function Page() {
  const s = await requirePortal(true);
  return <Card><h1 className="mb-4 text-xl font-semibold">Mot de passe</h1><PortalPassword forced={s.mustChangePassword} /></Card>;
}
