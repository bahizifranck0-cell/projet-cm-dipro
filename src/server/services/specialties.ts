import { z } from "zod";
import { db } from "../db";
import { assertCan, ValidationError, type Actor } from "../auth/actor";
import { audit } from "./audit";
import { opt, parse, req, toCode } from "./validation";

export const FIELD_TYPES = { text: "Texte court", textarea: "Texte long", number: "Nombre", select: "Liste de choix", checkbox: "Case à cocher", date: "Date" } as const;
export const formField = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1, "Chaque champ doit avoir un libellé.").max(80),
  type: z.enum(Object.keys(FIELD_TYPES) as [keyof typeof FIELD_TYPES, ...(keyof typeof FIELD_TYPES)[]]),
  options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  required: z.boolean().optional(),
  unit: z.string().trim().max(15).optional(),
}).refine((f) => f.type !== "select" || (f.options?.length ?? 0) >= 2, "Une liste de choix doit proposer au moins deux options.");
export type FormField = z.infer<typeof formField>;

export async function listSpecialties(activeOnly = false) {
  return db.specialty.findMany({
    where: activeOnly ? { active: true } : {}, orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      departments: { include: { department: true } },
      assignments: { where: { active: true }, include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      _count: { select: { consultations: true } },
    },
  });
}

export async function getSpecialty(id: string) {
  const s = await db.specialty.findUnique({
    where: { id },
    include: {
      departments: true,
      assignments: { orderBy: { startDate: "desc" }, include: { employee: { select: { id: true, firstName: true, lastName: true, photoPath: true } }, department: true } },
    },
  });
  if (!s) return null;
  const form = await activeForm(id, "CONSULTATION");
  return { ...s, form };
}

export async function activeForm(specialtyId: string | null, context: "CONSULTATION" | "MATERNITY_PRENATAL" | "MATERNITY_DELIVERY" | "MATERNITY_NEWBORN" | "MATERNITY_POSTNATAL" | "ADMISSION_FOLLOWUP") {
  return db.formTemplate.findFirst({ where: { specialtyId, context, active: true }, orderBy: { version: "desc" } });
}

const specInput = z.object({ name: req("Le nom de la spécialité", 80), description: opt(300), confidential: z.coerce.boolean().default(false), departmentIds: z.array(z.string()).default([]) });

export async function createSpecialty(actor: Actor, raw: unknown) {
  assertCan(actor, "settings", "update");
  const d = parse(specInput, raw);
  const code = toCode(d.name);
  if (await db.specialty.findFirst({ where: { OR: [{ code }, { name: { equals: d.name, mode: "insensitive" } }] } })) throw new ValidationError("Cette spécialité existe déjà.", "name");
  const s = await db.specialty.create({ data: { code, name: d.name, description: d.description, confidential: d.confidential, departments: { create: d.departmentIds.map((departmentId) => ({ departmentId })) } } });
  await audit(actor, { action: "CREATE", module: "settings", entityType: "Specialty", entityId: s.id, details: { name: d.name } });
  return s;
}

export async function updateSpecialty(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "settings", "update");
  const d = parse(specInput, raw);
  if (await db.specialty.findFirst({ where: { id: { not: id }, name: { equals: d.name, mode: "insensitive" } } })) throw new ValidationError("Cette spécialité existe déjà.", "name");
  await db.$transaction([
    db.specialtyDepartment.deleteMany({ where: { specialtyId: id } }),
    db.specialty.update({ where: { id }, data: { name: d.name, description: d.description ?? null, confidential: d.confidential, departments: { create: d.departmentIds.map((departmentId) => ({ departmentId })) } } }),
  ]);
  await audit(actor, { action: "UPDATE", module: "settings", entityType: "Specialty", entityId: id, details: d });
}

/** Désactiver ne détruit rien : les anciennes consultations restent consultables. */
export async function setSpecialtyActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "settings", "update");
  await db.specialty.update({ where: { id }, data: { active } });
  await audit(actor, { action: active ? "ACTIVATE" : "DEACTIVATE", module: "settings", entityType: "Specialty", entityId: id });
}

/** Enregistre une NOUVELLE version du formulaire ; les consultations passées gardent leur version. */
export async function saveForm(actor: Actor, specialtyId: string | null, context: Parameters<typeof activeForm>[1], fieldsRaw: unknown, validated: boolean) {
  assertCan(actor, "settings", "update");
  const fields = parse(z.array(formField).max(60), fieldsRaw);
  const keys = fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) throw new ValidationError("Deux champs ont le même identifiant.");
  const last = await db.formTemplate.findFirst({ where: { specialtyId, context }, orderBy: { version: "desc" } });
  const name = context === "CONSULTATION" ? "Consultation" : context;
  const t = await db.$transaction(async (tx) => {
    await tx.formTemplate.updateMany({ where: { specialtyId, context, active: true }, data: { active: false } });
    return tx.formTemplate.create({ data: { context, specialtyId, name, version: (last?.version ?? 0) + 1, fields, validated } });
  });
  await audit(actor, { action: "FORM_VERSION", module: "settings", entityType: "FormTemplate", entityId: t.id, details: { specialtyId, context, version: t.version, fields: fields.length, validated } });
  return t;
}

export async function assignDoctor(actor: Actor, specialtyId: string, employeeId: string, departmentId?: string) {
  assertCan(actor, "settings", "update");
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  if (!emp || emp.status !== "ACTIVE") throw new ValidationError("Employé introuvable ou inactif.", "employeeId");
  const spec = await db.specialty.findUnique({ where: { id: specialtyId } });
  if (!spec?.active) throw new ValidationError("Spécialité introuvable ou désactivée.");
  if (await db.doctorAssignment.findFirst({ where: { employeeId, specialtyId, active: true } })) throw new ValidationError("Ce médecin est déjà affecté à cette spécialité.", "employeeId");
  const a = await db.doctorAssignment.create({ data: { employeeId, specialtyId, departmentId: departmentId || null } });
  await audit(actor, { action: "ASSIGN", module: "settings", entityType: "DoctorAssignment", entityId: a.id, details: { employeeId, specialtyId, departmentId: departmentId ?? null } });
  return a;
}

export async function endAssignment(actor: Actor, assignmentId: string) {
  assertCan(actor, "settings", "update");
  await db.doctorAssignment.update({ where: { id: assignmentId }, data: { active: false, endDate: new Date() } });
  await audit(actor, { action: "UNASSIGN", module: "settings", entityType: "DoctorAssignment", entityId: assignmentId });
}

/** Valide les données saisies dans un formulaire de spécialité. */
export function validateFormData(fields: FormField[], data: Record<string, unknown>) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const f of fields) {
    const v = data[f.key];
    const empty = v === undefined || v === null || v === "" || (f.type === "checkbox" && v === false);
    if (f.required && empty) throw new ValidationError(`Le champ « ${f.label} » est obligatoire.`, `f_${f.key}`);
    if (empty) { out[f.key] = f.type === "checkbox" ? false : null; continue; }
    if (f.type === "number") { const n = Number(String(v).replace(",", ".")); if (Number.isNaN(n)) throw new ValidationError(`« ${f.label} » doit être un nombre.`, `f_${f.key}`); out[f.key] = n; }
    else if (f.type === "checkbox") out[f.key] = v === true || v === "on" || v === "true";
    else if (f.type === "select") { if (!f.options?.includes(String(v))) throw new ValidationError(`Choix invalide pour « ${f.label} ».`, `f_${f.key}`); out[f.key] = String(v); }
    else out[f.key] = String(v).slice(0, f.type === "textarea" ? 5000 : 300);
  }
  return out;
}
