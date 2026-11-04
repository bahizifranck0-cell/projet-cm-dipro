"use server";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import { markRead } from "@/server/services/notifications";
import { runAction, type ActionState } from "@/server/actions/result";
export async function markAllReadAction(_: ActionState): Promise<ActionState> {
  return runAction(async () => { await markRead(await actionActor(), "all"); revalidatePath("/", "layout"); return "Toutes les notifications sont marquées comme lues."; });
}
