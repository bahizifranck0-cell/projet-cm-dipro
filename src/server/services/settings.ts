import { z } from "zod";
import { db } from "../db";
import { assertCan, type Actor } from "../auth/actor";
import { audit } from "./audit";
import { parse } from "./validation";

// Paramètres configurables. Les valeurs par défaut sont provisoires et signalées « à confirmer ».
export const SETTING_DEFS = {
  "patients.numberPrefix": { schema: z.string().trim().regex(/^[A-Z0-9-]{1,10}$/, "Préfixe : 1 à 10 caractères (majuscules, chiffres, tiret)."), default: "P", label: "Préfixe du numéro de dossier patient" },
  "patients.numberPadding": { schema: z.coerce.number().int().min(3, "Minimum 3 chiffres.").max(8, "Maximum 8 chiffres."), default: 5, label: "Nombre de chiffres du numéro de dossier" },
  "patients.numberWithYear": { schema: z.coerce.boolean(), default: true, label: "Inclure l'année dans le numéro" },
} as const;
export type SettingKey = keyof typeof SETTING_DEFS;
type Val<K extends SettingKey> = z.infer<(typeof SETTING_DEFS)[K]["schema"]>;

export async function getSetting<K extends SettingKey>(key: K): Promise<Val<K>> {
  const row = await db.setting.findUnique({ where: { key } });
  return (row ? row.value : SETTING_DEFS[key].default) as Val<K>;
}

export async function getSettings() {
  const rows = await db.setting.findMany({ where: { key: { in: Object.keys(SETTING_DEFS) } } });
  return Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, d]) => {
    const r = rows.find((x) => x.key === k);
    return [k, { value: r ? r.value : d.default, label: d.label, isDefault: !r }];
  })) as Record<SettingKey, { value: unknown; label: string; isDefault: boolean }>;
}

export async function setSetting<K extends SettingKey>(actor: Actor, key: K, raw: unknown) {
  assertCan(actor, "settings", "update");
  const value = parse(SETTING_DEFS[key].schema as z.ZodType, raw);
  const before = await db.setting.findUnique({ where: { key } });
  await db.setting.upsert({ where: { key }, create: { key, value: value as never, updatedById: actor.userId }, update: { value: value as never, updatedById: actor.userId } });
  await audit(actor, { action: "UPDATE", module: "settings", entityType: "Setting", entityId: key, details: { before: (before?.value ?? null) as never, after: value as never } });
}
