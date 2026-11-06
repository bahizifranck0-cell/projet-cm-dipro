"use server";
// Actions du module Caisse (sessions et opérations) — transfert PREMIDIS.
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import { runAction, str, type ActionState } from "@/server/actions/result";
import * as cash from "@/server/services/cash";

const refresh = () => revalidatePath("/caisse");

export async function openSessionAction(currency: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const s = await cash.openSession(await actionActor(), { currency, openingFloat: str(fd, "openingFloat") ?? "", notes: str(fd, "notes") });
    refresh(); return `Session ${s.currency} ouverte.`;
  });
}

export async function closeSessionAction(currency: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const counts: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("count_") && typeof v === "string") counts[k.slice(6)] = v;
    const s = await cash.closeSession(await actionActor(), { currency, counts, notes: str(fd, "notes") });
    refresh();
    const d = Number(s.difference ?? 0);
    return `Session clôturée (écart ${d >= 0 ? "+" : ""}${d.toFixed(2)} ${s.currency}).`;
  });
}

export async function operationAction(type: "IN" | "OUT", currency: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const op = await cash.createOperation(await actionActor(), { type, currency, amount: str(fd, "amount") ?? "", category: str(fd, "category") ?? "", method: str(fd, "method") ?? "cash", description: str(fd, "description") });
    refresh(); return `Opération ${op.number} enregistrée.`;
  });
}
