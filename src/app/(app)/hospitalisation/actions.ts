"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as hosp from "@/server/services/hospitalization";
import { runAction, str, type ActionState } from "@/server/actions/result";
import type { FormContext } from "@prisma/client";

export async function admitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    id = (await hosp.admit(await actionActor(), { patientId: str(fd, "patientId"), type: str(fd, "type"), reason: str(fd, "reason"), bedId: str(fd, "bedId"), visitId: str(fd, "visitId") })).id;
  });
  if (r?.ok) redirect(`/hospitalisation/${id}?admis=1`);
  return r;
}
const refresh = (id: string) => { revalidatePath(`/hospitalisation/${id}`); revalidatePath("/hospitalisation"); };
export async function assignBedAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hosp.assignBed(await actionActor(), id, str(fd, "bedId") ?? ""); refresh(id); return "Lit attribué."; });
}
export async function noteAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hosp.addNote(await actionActor(), id, str(fd, "kind") ?? "", str(fd, "content") ?? ""); refresh(id); return "Note ajoutée."; });
}
export async function maternityAction(id: string, context: FormContext, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const data: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("f_")) data[k.slice(2)] = v;
    await hosp.addMaternityRecord(await actionActor(), id, context, data, str(fd, "notes")); refresh(id); return "Fiche enregistrée.";
  });
}
export async function newbornAction(admissionId: string, deliveryId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await hosp.registerNewborn(await actionActor(), deliveryId, { firstName: str(fd, "firstName"), sex: str(fd, "sex"), notes: str(fd, "notes"), createRecord: fd.get("createRecord") === "on" });
    refresh(admissionId); return "Nouveau-né enregistré.";
  });
}
export async function dischargeAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hosp.discharge(await actionActor(), id, str(fd, "notes")); refresh(id); return "Sortie enregistrée. Le lit est libéré."; });
}
export async function stayChargeAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => { const c = await hosp.updateStayCharge(await actionActor(), id); refresh(id); return c ? "Frais de séjour mis à jour sur le compte du patient." : "Aucun tarif d'hospitalisation n'est configuré : rien n'a été facturé."; });
}
export async function roomAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hosp.createRoom(await actionActor(), { code: str(fd, "code"), name: str(fd, "name"), category: str(fd, "category"), departmentId: str(fd, "departmentId") }); revalidatePath("/hospitalisation/chambres"); return "Chambre créée."; });
}
export async function bedAction(roomId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hosp.addBed(await actionActor(), roomId, str(fd, "code") ?? ""); revalidatePath("/hospitalisation/chambres"); return "Lit ajouté."; });
}
export async function bedServiceAction(bedId: string, out: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await hosp.setBedOutOfService(await actionActor(), bedId, out); revalidatePath("/hospitalisation/chambres"); return out ? "Lit mis hors service." : "Lit remis en service."; });
}
