"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as roles from "@/server/services/roles";
import { runAction, str, type ActionState } from "@/server/actions/result";

export async function createRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => { id = (await roles.createRole(await actionActor(), { name: str(fd, "name"), description: str(fd, "description") })).id; });
  if (res?.ok) redirect(`/parametres/roles/${id}`);
  return res;
}

export async function updateRoleAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await roles.updateRole(await actionActor(), id, { name: str(fd, "name"), description: str(fd, "description") });
    revalidatePath("/parametres/roles");
    return "Rôle renommé.";
  });
}

export async function savePermissionsAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const keys = fd.getAll("perm").filter((v): v is string => typeof v === "string");
    await roles.setRolePermissions(await actionActor(), id, keys);
    revalidatePath(`/parametres/roles/${id}`);
    return `Permissions enregistrées (${keys.length}). Elles s'appliquent immédiatement aux utilisateurs de ce rôle.`;
  });
}

export async function setRoleActiveAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    await roles.setRoleActive(await actionActor(), id, active);
    revalidatePath(`/parametres/roles/${id}`);
    return active ? "Rôle réactivé." : "Rôle désactivé : ses utilisateurs n'ont plus aucune permission.";
  });
}

export async function deleteRoleAction(id: string, _: ActionState): Promise<ActionState> {
  const res = await runAction(async () => { await roles.deleteRole(await actionActor(), id); });
  if (res?.ok) redirect("/parametres/roles");
  return res;
}
