import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { assertCan, ValidationError, type Actor } from "../auth/actor";
import { normalizeName, phoneDigits } from "@/lib/normalize";
import { audit } from "./audit";
import { getSetting } from "./settings";
import { nextNumber } from "./sequences";
import { opt, parse, req } from "./validation";

const dateStr = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) { ctx.addIssue({ code: "custom", message: "Date de naissance invalide." }); return z.NEVER; }
  if (d > new Date()) { ctx.addIssue({ code: "custom", message: "La date de naissance ne peut pas être dans le futur." }); return z.NEVER; }
  if (d.getUTCFullYear() < 1900) { ctx.addIssue({ code: "custom", message: "Date de naissance invalide." }); return z.NEVER; }
  return d;
});

// Informations administratives uniquement (le secrétariat ne saisit rien de médical ni de financier).
export const patientInput = z.object({
  lastName: req("Le nom", 60),
  postName: opt(60),
  firstName: req("Le prénom", 60),
  sex: z.enum(["F", "M"]).optional().or(z.literal("").transform(() => undefined)),
  birthDate: dateStr,
  phone: opt(30).refine((v) => !v || /^[+\d\s().-]{6,30}$/.test(v), "Numéro de téléphone invalide."),
  address: opt(200),
});
export type PatientInput = z.input<typeof patientInput>;

function searchFields(d: { lastName: string; postName?: string | null; firstName: string; phone?: string | null }) {
  return { searchName: normalizeName(d.lastName, d.postName, d.firstName), phoneDigits: phoneDigits(d.phone) };
}

async function formatNumber(): Promise<string> {
  const [prefix, padding, withYear] = await Promise.all([getSetting("patients.numberPrefix"), getSetting("patients.numberPadding"), getSetting("patients.numberWithYear")]);
  const year = new Date().getUTCFullYear();
  const key = withYear ? `PAT-${year}` : "PAT";
  const n = String(await nextNumber(key)).padStart(padding, "0");
  return withYear ? `${prefix}-${year}-${n}` : `${prefix}-${n}`;
}

export type DuplicateCandidate = { id: string; patientNumber: string; name: string; phone: string | null; birthDate: Date | null; reasons: string[] };

/**
 * Dossiers qui pourraient être la même personne :
 * même téléphone, même nom complet (dans n'importe quel ordre), ou même nom + prénom avec même date de naissance.
 */
export async function findPossibleDuplicates(actor: Actor, raw: PatientInput, excludeId?: string): Promise<DuplicateCandidate[]> {
  assertCan(actor, "patients", "view");
  const d = parse(patientInput, raw);
  const { phoneDigits: ph } = searchFields(d);
  const tokens = normalizeName(d.lastName, d.postName, d.firstName).split(" ").filter((t) => t.length >= 2);
  const ln = normalizeName(d.lastName), fn = normalizeName(d.firstName);

  const or: Prisma.PatientWhereInput[] = [];
  if (ph) or.push({ phoneDigits: ph });
  if (tokens.length) or.push({ AND: tokens.map((t) => ({ searchName: { contains: t } })) });
  if (ln && fn) or.push({ AND: [{ searchName: { contains: ln } }, { searchName: { contains: fn } }] });
  if (!or.length) return [];
  const rows = await db.patient.findMany({ where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) }, take: 10, orderBy: { createdAt: "desc" } });

  return rows.map((p) => {
    const reasons: string[] = [];
    if (ph && p.phoneDigits === ph) reasons.push("même téléphone");
    const words = new Set(p.searchName.split(" "));
    if (tokens.length && tokens.every((t) => words.has(t))) reasons.push("même nom complet");
    else if (words.has(ln) && words.has(fn)) reasons.push("même nom et prénom");
    if (d.birthDate && p.birthDate && p.birthDate.getTime() === d.birthDate.getTime()) reasons.push("même date de naissance");
    return { id: p.id, patientNumber: p.patientNumber, name: displayName(p), phone: p.phone, birthDate: p.birthDate, reasons };
  }).filter((c) => c.reasons.length > 0);
}

/**
 * Crée un dossier. Si des doublons possibles existent, la création est refusée
 * tant que l'utilisateur n'a pas confirmé qu'il s'agit d'une autre personne.
 */
export async function createPatient(actor: Actor, raw: PatientInput, opts: { confirmedNotDuplicate?: boolean } = {}) {
  assertCan(actor, "patients", "create");
  const d = parse(patientInput, raw);
  const dups = await findPossibleDuplicates(actor, raw);
  if (dups.length && !opts.confirmedNotDuplicate) return { created: false as const, duplicates: dups };

  const patient = await db.patient.create({
    data: { ...d, ...searchFields(d), patientNumber: await formatNumber(), createdById: actor.userId },
  });
  await audit(actor, {
    action: "CREATE", module: "patients", entityType: "Patient", entityId: patient.id,
    details: { patientNumber: patient.patientNumber, duplicatesOverridden: dups.map((x) => x.patientNumber) },
  });
  return { created: true as const, patient };
}

export async function updatePatient(actor: Actor, id: string, raw: PatientInput) {
  assertCan(actor, "patients", "update");
  const d = parse(patientInput, raw);
  const before = await db.patient.findUnique({ where: { id } });
  if (!before) throw new ValidationError("Dossier introuvable.");
  const after = await db.patient.update({ where: { id }, data: { // un champ vidé dans le formulaire est effacé
    lastName: d.lastName, firstName: d.firstName, postName: d.postName ?? null, sex: d.sex ?? null,
    birthDate: d.birthDate ?? null, phone: d.phone ?? null, address: d.address ?? null, ...searchFields(d) } });
  const keys = ["lastName", "postName", "firstName", "sex", "birthDate", "phone", "address"] as const;
  const changes = Object.fromEntries(keys.filter((k) => String(before[k] ?? "") !== String(after[k] ?? "")).map((k) => [k, { before: before[k] ?? null, after: after[k] ?? null }]));
  if (Object.keys(changes).length)
    await audit(actor, { action: "UPDATE", module: "patients", entityType: "Patient", entityId: id, details: JSON.parse(JSON.stringify(changes)) });
  return after;
}

/** Recherche par numéro de dossier, téléphone ou nom (mots dans n'importe quel ordre, sans accents). */
export async function searchPatients(actor: Actor, q: string, take = 30) {
  assertCan(actor, "patients", "view");
  const term = q.trim();
  if (!term) return db.patient.findMany({ orderBy: { createdAt: "desc" }, take, include: openVisitInclude });
  const or: Prisma.PatientWhereInput[] = [{ patientNumber: { equals: term.toUpperCase() } }, { patientNumber: { contains: term.toUpperCase() } }];
  const ph = term.replace(/\D/g, "");
  if (ph.length >= 4) or.push({ phoneDigits: { contains: ph.length >= 9 ? ph.slice(-9) : ph } });
  const tokens = normalizeName(term).split(" ").filter(Boolean);
  if (tokens.length) or.push({ AND: tokens.map((t) => ({ searchName: { contains: t } })) });
  return db.patient.findMany({ where: { OR: or }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take, include: openVisitInclude });
}

const OPEN = ["WAITING", "ORIENTED", "IN_CONSULTATION", "ADMITTED"] as const;
const openVisitInclude = { visits: { where: { status: { in: [...OPEN] } }, take: 1 } } satisfies Prisma.PatientInclude;

export async function getPatientRecord(actor: Actor, id: string) {
  assertCan(actor, "patients", "view");
  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      visits: { orderBy: { arrivedAt: "desc" }, take: 50, include: { orientedToDepartment: true, orientedToDoctor: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!patient) return null;
  const creator = patient.createdById ? await db.user.findUnique({ where: { id: patient.createdById }, select: { username: true } }) : null;
  return { patient, creator: creator?.username ?? null };
}

export function displayName(p: { lastName: string; postName?: string | null; firstName: string }) {
  return [p.lastName.toUpperCase(), p.postName?.toUpperCase(), p.firstName].filter(Boolean).join(" ");
}

export function ageFrom(birth: Date | null, now = new Date()) {
  if (!birth) return null;
  let a = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) a--;
  return a;
}
