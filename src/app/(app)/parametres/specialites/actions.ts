"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as spec from "@/server/services/specialties";
import { runAction, str, type ActionState } from "@/server/actions/result";

const input = (fd: FormData) => ({ name: str(fd, "name"), description: str(fd, "description"), confidential: fd.get("confidential") === "on", departmentIds: fd.getAll("departmentIds").map(String) });

export async function createSpecialtyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => { id = (await spec.createSpecialty(await actionActor(), input(fd))).id; });
  if (r?.ok) redirect(`/parametres/specialites/${id}`);
  return r;
}
export async function updateSpecialtyAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await spec.updateSpecialty(await actionActor(), id, input(fd)); revalidatePath(`/parametres/specialites/${id}`); return "Spécialité enregistrée."; });
}
export async function toggleSpecialtyAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await spec.setSpecialtyActive(await actionActor(), id, active); revalidatePath(`/parametres/specialites/${id}`); return active ? "Spécialité réactivée." : "Spécialité désactivée. Les anciens dossiers restent consultables."; });
}
export async function saveFormAction(specialtyId: string | null, context: Parameters<typeof spec.saveForm>[2], _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const fields = JSON.parse(String(fd.get("fields") ?? "[]"));
    const t = await spec.saveForm(await actionActor(), specialtyId, context, fields, fd.get("validated") === "on");
    revalidatePath(specialtyId ? `/parametres/specialites/${specialtyId}` : "/parametres/formulaires");
    return `Formulaire enregistré (version ${t.version}). Les consultations déjà faites gardent leur version.`;
  });
}
export async function assignDoctorAction(specialtyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await spec.assignDoctor(await actionActor(), specialtyId, str(fd, "employeeId") ?? "", str(fd, "departmentId")); revalidatePath(`/parametres/specialites/${specialtyId}`); return "Médecin affecté."; });
}
export async function endAssignmentAction(specialtyId: string, assignmentId: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await spec.endAssignment(await actionActor(), assignmentId); revalidatePath(`/parametres/specialites/${specialtyId}`); return "Affectation terminée."; });
}
