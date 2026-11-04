"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as ph from "@/server/services/pharmacy";
import { runAction, str, type ActionState } from "@/server/actions/result";

const photoOf = async (fd: FormData) => { const f = fd.get("photo"); return f instanceof File && f.size > 0 ? Buffer.from(await f.arrayBuffer()) : undefined; };
const input = (fd: FormData) => ({ name: str(fd, "name"), description: str(fd, "description"), unit: str(fd, "unit"), price: str(fd, "price"), currency: str(fd, "currency"), minStockLevel: str(fd, "minStockLevel"), shopVisible: fd.get("shopVisible") === "on" });
const r = () => { revalidatePath("/pharmacie"); };

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => { id = (await ph.createProduct(await actionActor(), input(fd), await photoOf(fd))).id; });
  if (res?.ok) redirect(`/pharmacie/produits/${id}?cree=1`);
  return res;
}
export async function updateProductAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await ph.updateProduct(await actionActor(), id, input(fd), await photoOf(fd)); revalidatePath(`/pharmacie/produits/${id}`); r(); return "Produit enregistré."; });
}
export async function stockAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await actionActor();
    if (fd.get("kind") === "adjust") await ph.adjustStock(a, id, str(fd, "quantity"), str(fd, "reason") ?? "");
    else await ph.stockEntry(a, id, str(fd, "quantity"), str(fd, "reason"));
    revalidatePath(`/pharmacie/produits/${id}`); r(); return fd.get("kind") === "adjust" ? "Correction enregistrée." : "Entrée en stock enregistrée.";
  });
}
export async function saleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ids = fd.getAll("productId").map(String), qtys = fd.getAll("quantity").map(String);
    const { invoice } = await ph.directSale(await actionActor(), ids.map((productId, i) => ({ productId, quantity: qtys[i] })), str(fd, "customerName"));
    r(); return `Vente enregistrée — facture ${invoice.number} à régler à la caisse.`;
  });
}
export async function consumeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await ph.consumeForPatient(await actionActor(), { patientId: str(fd, "patientId") ?? "", productId: str(fd, "productId") ?? "", quantity: str(fd, "quantity"), reason: str(fd, "reason") });
    r(); return "Sortie enregistrée et ajoutée au compte du patient.";
  });
}
export async function reverseAction(productId: string, movementId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await ph.reverseConsumption(await actionActor(), movementId, str(fd, "reason") ?? ""); revalidatePath(`/pharmacie/produits/${productId}`); return "Consommation annulée."; });
}
export async function toggleProductAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await ph.setProductActive(await actionActor(), id, active); revalidatePath(`/pharmacie/produits/${id}`); r(); return active ? "Produit réactivé." : "Produit retiré."; });
}
