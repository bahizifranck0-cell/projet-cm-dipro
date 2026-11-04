import { ForbiddenError, ValidationError } from "../auth/actor";

export type ActionState = { ok?: boolean; error?: string; field?: string; message?: string } | undefined;

/** Transforme les erreurs métier en message affichable ; journalise les erreurs inattendues. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? "Enregistré." };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message, field: e.field };
    if (e instanceof ForbiddenError) return { error: e.message };
    console.error("[action]", e);
    return { error: "Une erreur inattendue est survenue. L'opération n'a pas été enregistrée." };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};
