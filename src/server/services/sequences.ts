import { db, type Tx } from "../db";

/** Prochain numéro d'une séquence, sûr même avec plusieurs utilisateurs simultanés. */
export async function nextNumber(key: string, tx: Tx = db): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "Sequence".value + 1
    RETURNING value`;
  return rows[0].value;
}
