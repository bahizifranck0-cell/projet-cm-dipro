"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as billing from "@/server/services/billing";
import * as fin from "@/server/services/finance";
import { runAction, str, type ActionState } from "@/server/actions/result";
import type { Currency } from "@prisma/client";

const inv = (id: string) => { revalidatePath(`/caisse/factures/${id}`); revalidatePath("/caisse"); };
export async function invoiceAction(patientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => { id = (await billing.createPatientInvoice(await actionActor(), patientId, (str(fd, "currency") ?? "USD") as Currency)).id; });
  if (r?.ok) redirect(`/caisse/factures/${id}?creee=1`);
  return r;
}
export async function paymentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { const p = await billing.recordPayment(await actionActor(), id, { amount: str(fd, "amount") ?? "", currency: (str(fd, "currency") ?? "USD") as Currency, note: str(fd, "note") }); inv(id); return `Paiement enregistré — reçu ${p.number}.`; });
}
export async function invoicePdfAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await billing.invoicePdf(await actionActor(), id); inv(id); return "Facture PDF générée."; });
}
export async function discountAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await billing.requestDiscount(await actionActor(), id, { amount: str(fd, "amount") ?? "", reason: str(fd, "reason") ?? "" }); inv(id); return "Remise demandée : en attente de validation."; });
}
export async function decideDiscountAction(invoiceId: string, discountId: string, approve: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await billing.decideDiscount(await actionActor(), discountId, approve); inv(invoiceId); return approve ? "Remise appliquée." : "Remise refusée."; });
}
export async function creditAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await billing.requestCredit(await actionActor(), id, str(fd, "reason") ?? ""); inv(id); return "Demande de crédit envoyée au Directeur général."; });
}
export async function decideCreditAction(creditId: string, approve: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await billing.decideCredit(await actionActor(), creditId, approve, str(fd, "note")); revalidatePath("/credits"); return approve ? "Crédit approuvé : dette enregistrée, sortie autorisée." : "Crédit refusé."; });
}
export async function reversePaymentAction(invoiceId: string, paymentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await billing.reversePayment(await actionActor(), paymentId, str(fd, "reason") ?? ""); inv(invoiceId); return "Paiement extourné."; });
}
export async function cancelInvoiceAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await billing.cancelInvoice(await actionActor(), id, str(fd, "reason") ?? ""); inv(id); return "Facture annulée : les prestations peuvent être refacturées."; });
}
export async function tariffAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await billing.saveTariff(await actionActor(), { code: str(fd, "code"), name: str(fd, "name"), category: str(fd, "category"), price: str(fd, "price"), currency: str(fd, "currency"), unit: str(fd, "unit"), specialtyId: str(fd, "specialtyId"), departmentId: str(fd, "departmentId") }, id ?? undefined);
    revalidatePath("/tarifs"); return id ? "Tarif modifié." : "Tarif ajouté.";
  });
}
export async function tariffToggleAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await billing.setTariffActive(await actionActor(), id, active); revalidatePath("/tarifs"); return active ? "Tarif réactivé." : "Tarif retiré."; });
}
export async function rateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await billing.setRate(await actionActor(), str(fd, "rate") ?? ""); revalidatePath("/finance/parametres"); return "Taux de change enregistré."; });
}
export async function categoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await fin.createCategory(await actionActor(), str(fd, "name") ?? ""); revalidatePath("/finance/parametres"); return "Catégorie ajoutée."; });
}
export async function ruleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await fin.setApprovalRule(await actionActor(), str(fd, "roleId") ?? "", (str(fd, "currency") ?? "USD") as Currency, str(fd, "maxAmount") ?? null); revalidatePath("/finance/parametres"); return "Plafond enregistré."; });
}
export async function expenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { const e = await fin.createExpense(await actionActor(), { departmentId: str(fd, "departmentId"), categoryId: str(fd, "categoryId"), description: str(fd, "description"), amount: str(fd, "amount"), currency: str(fd, "currency") }); revalidatePath("/finance/depenses"); return `Dépense ${e.number} soumise.`; });
}
export async function decideExpenseAction(id: string, approve: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await fin.decideExpense(await actionActor(), id, approve); revalidatePath("/finance/depenses"); return approve ? "Dépense validée." : "Dépense refusée."; });
}
export async function payExpenseAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await fin.payExpense(await actionActor(), id); revalidatePath("/finance/depenses"); return "Dépense payée et inscrite au journal."; });
}
export async function reconciliationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { const r = await fin.createReconciliation(await actionActor(), { period: str(fd, "period") ?? "", currency: (str(fd, "currency") ?? "USD") as Currency, counted: str(fd, "counted") ?? "", notes: str(fd, "notes") }); revalidatePath("/finance/journal"); return `Réconciliation enregistrée (écart : ${r.difference}).`; });
}
export async function approveReconciliationAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await fin.approveReconciliation(await actionActor(), id); revalidatePath("/finance/journal"); return "Réconciliation validée."; });
}
