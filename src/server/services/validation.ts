import { z } from "zod";
import { ValidationError } from "../auth/actor";

/** Valide une entrée avec zod et renvoie un message lisible en français. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ValidationError(issue.message, issue.path.join("."));
  }
  return r.data;
}

export const req = (label: string, max = 120) =>
  z.string({ message: `${label} est obligatoire.` }).trim().min(1, `${label} est obligatoire.`).max(max, `${label} est trop long.`);
export const opt = (max = 200) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/** Code technique dérivé d'un libellé : "Responsable labo" → "RESPONSABLE_LABO" */
export function toCode(label: string) {
  return label.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}
