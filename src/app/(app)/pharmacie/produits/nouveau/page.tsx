import { requirePage } from "@/server/auth/current";
import { Card, PageHeader } from "@/components/ui/card";
import { ProductForm } from "@/components/pharmacy/pharmacy-forms";
export const metadata = { title: "Nouveau produit" };
export default async function Page() {
  await requirePage("pharmacy", "create");
  return <div className="max-w-3xl"><PageHeader title="Nouveau produit" /><Card><ProductForm /></Card></div>;
}
