"use server";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import { setSetting } from "@/server/services/settings";
import { runAction, str, type ActionState } from "@/server/actions/result";

export async function savePatientNumberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await actionActor();
    await setSetting(a, "patients.numberPrefix", str(fd, "prefix")?.toUpperCase());
    await setSetting(a, "patients.numberPadding", str(fd, "padding"));
    await setSetting(a, "patients.numberWithYear", fd.get("withYear") === "on");
    revalidatePath("/parametres/general");
    return "Format enregistré. Il s'applique aux prochains dossiers ; les numéros existants ne changent pas.";
  });
}
