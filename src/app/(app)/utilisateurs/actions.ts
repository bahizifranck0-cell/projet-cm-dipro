"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as users from "@/server/services/users";
import { runAction, str, type ActionState } from "@/server/actions/result";

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => {
    const actor = await actionActor();
    const u = await users.createUser(actor, {
      employeeId: str(fd, "employeeId"), username: str(fd, "username"), password: str(fd, "password"),
      roleId: str(fd, "roleId"), departmentId: str(fd, "departmentId"), status: str(fd, "status") ?? "ACTIVE",
    });
    id = u.id;
  });
  if (res?.ok) redirect(`/utilisateurs/${id}`);
  return res;
}

export async function updateAssignmentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await users.updateUserAssignment(await actionActor(), id, { roleId: str(fd, "roleId"), departmentId: str(fd, "departmentId") });
    revalidatePath(`/utilisateurs/${id}`);
    return "Affectation mise à jour.";
  });
}

export async function setStatusAction(id: string, status: "ACTIVE" | "DISABLED", _: ActionState): Promise<ActionState> {
  return runAction(async () => {
    await users.setUserStatus(await actionActor(), id, status);
    revalidatePath(`/utilisateurs/${id}`);
    return status === "DISABLED" ? "Compte désactivé : l'utilisateur a été déconnecté." : "Compte réactivé.";
  });
}

export async function resetPasswordAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await users.resetUserPassword(await actionActor(), id, str(fd, "password") ?? "");
    return "Mot de passe provisoire enregistré. L'utilisateur devra le changer à sa prochaine connexion.";
  });
}
