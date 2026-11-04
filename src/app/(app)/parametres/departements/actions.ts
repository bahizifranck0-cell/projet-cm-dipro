"use server";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as deps from "@/server/services/departments";
import { runAction, str, type ActionState } from "@/server/actions/result";

export async function createDepartmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deps.createDepartment(await actionActor(), { name: str(fd, "name") });
    revalidatePath("/parametres/departements");
    return "Département ajouté.";
  });
}
export async function renameDepartmentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deps.renameDepartment(await actionActor(), id, { name: str(fd, "name") });
    revalidatePath("/parametres/departements");
    return "Renommé.";
  });
}
export async function toggleDepartmentAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    await deps.setDepartmentActive(await actionActor(), id, active);
    revalidatePath("/parametres/departements");
    return active ? "Réactivé." : "Désactivé.";
  });
}
