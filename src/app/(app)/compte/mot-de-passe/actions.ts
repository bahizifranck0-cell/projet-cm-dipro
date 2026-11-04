"use server";
import { actionActor } from "@/server/auth/current";
import { changeOwnPassword } from "@/server/services/auth";
import { runAction, str, type ActionState } from "@/server/actions/result";

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actionActor({ allowPasswordChange: true });
    await changeOwnPassword(actor, str(fd, "current") ?? "", str(fd, "next") ?? "", str(fd, "confirm") ?? "");
    return "Mot de passe modifié. Vos autres appareils ont été déconnectés.";
  });
}
