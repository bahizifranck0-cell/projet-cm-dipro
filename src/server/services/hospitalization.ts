import { z } from "zod";
import { Prisma, type AdmissionType, type FormContext } from "@prisma/client";
import { db } from "../db";
import { assertCan, can, ValidationError, type Actor } from "../auth/actor";
import { audit } from "./audit";
import { chargeFromTariff } from "./charges";
import { financialClearance } from "./clearance";
import { notifyPermission } from "./notifications";
import { activeForm, validateFormData, type FormField } from "./specialties";
import { opt, parse, req } from "./validation";

export const ADMISSION_TYPE: Record<AdmissionType, string> = { EMERGENCY: "Urgence", HOSPITALIZATION: "Hospitalisation", MATERNITY: "Maternité" };

// ── Chambres et lits (configurés selon la réalité de l'hôpital : rien n'est créé d'office) ──
const roomInput = z.object({ code: req("Le code", 20), name: req("Le nom", 80), category: req("La catégorie", 60), departmentId: opt(40) });

export async function createRoom(actor: Actor, raw: unknown) {
  assertCan(actor, "hospitalization", "create");
  const d = parse(roomInput, raw);
  if (await db.room.findUnique({ where: { code: d.code.toUpperCase() } })) throw new ValidationError("Ce code de chambre existe déjà.", "code");
  const r = await db.room.create({ data: { ...d, code: d.code.toUpperCase() } });
  await audit(actor, { action: "CREATE", module: "hospitalization", entityType: "Room", entityId: r.id, details: d });
  return r;
}

export async function addBed(actor: Actor, roomId: string, codeRaw: string) {
  assertCan(actor, "hospitalization", "create");
  const code = codeRaw?.trim().toUpperCase();
  if (!code) throw new ValidationError("Indiquez le code du lit.", "code");
  if (await db.bed.findFirst({ where: { roomId, code } })) throw new ValidationError("Ce lit existe déjà dans cette chambre.", "code");
  const b = await db.bed.create({ data: { roomId, code } });
  await audit(actor, { action: "CREATE", module: "hospitalization", entityType: "Bed", entityId: b.id, details: { roomId, code } });
  return b;
}

export async function setBedOutOfService(actor: Actor, bedId: string, out: boolean) {
  assertCan(actor, "hospitalization", "update");
  const b = await db.bed.findUniqueOrThrow({ where: { id: bedId } });
  if (b.status === "OCCUPIED") throw new ValidationError("Ce lit est occupé.");
  await db.bed.update({ where: { id: bedId }, data: { status: out ? "OUT_OF_SERVICE" : "AVAILABLE" } });
  await audit(actor, { action: out ? "DEACTIVATE" : "ACTIVATE", module: "hospitalization", entityType: "Bed", entityId: bedId });
}

export async function bedBoard() {
  return db.room.findMany({
    where: { active: true }, orderBy: { code: "asc" },
    include: { department: true, beds: { orderBy: { code: "asc" }, include: { assignments: { where: { endAt: null }, include: { admission: { include: { patient: true } } } } } } },
  });
}

// ── Admissions ──
const admitInput = z.object({ patientId: req("Le patient", 40), type: z.enum(["EMERGENCY", "HOSPITALIZATION", "MATERNITY"]), reason: opt(500), bedId: opt(40), visitId: opt(40) });

export async function admit(actor: Actor, raw: unknown) {
  assertCan(actor, "hospitalization", "create");
  const d = parse(admitInput, raw);
  if (!(await db.patient.findUnique({ where: { id: d.patientId } }))) throw new ValidationError("Patient introuvable.");
  if (await db.admission.findFirst({ where: { patientId: d.patientId, status: "ACTIVE" } })) throw new ValidationError("Ce patient est déjà admis.");
  const visit = d.visitId ? await db.visit.findUnique({ where: { id: d.visitId } })
    : await db.visit.findFirst({ where: { patientId: d.patientId, status: { in: ["WAITING", "ORIENTED", "IN_CONSULTATION"] } } });
  const a = await db.$transaction(async (tx) => {
    // Admission directe aux urgences sans passage préalable : un passage est ouvert automatiquement
    const v = visit ?? await tx.visit.create({ data: { patientId: d.patientId, reason: d.reason ?? ADMISSION_TYPE[d.type], registeredById: actor.userId, priority: d.type === "EMERGENCY" } });
    const a = await tx.admission.create({ data: { patientId: d.patientId, visitId: v.id, type: d.type, reason: d.reason, admittedById: actor.userId, decidedByDoctorId: actor.employeeId } });
    await tx.visit.update({ where: { id: v.id }, data: { status: "ADMITTED" } });
    if (d.bedId) await placeInBed(tx, a.id, d.bedId, actor.userId);
    await audit(actor, { action: "ADMIT", module: "hospitalization", entityType: "Admission", entityId: a.id, details: { patientId: d.patientId, type: d.type, bedId: d.bedId ?? null } }, tx);
    await notifyPermission("hospitalization", "update", { module: "hospitalization", type: "ADMISSION", title: `Nouvelle admission (${ADMISSION_TYPE[d.type]})`, body: d.reason, entityType: "Admission", entityId: a.id, link: `/hospitalisation/${a.id}`, dedupeKey: `adm:${a.id}` }, tx, actor.userId);
    return a;
  });
  return a;
}

async function placeInBed(tx: Prisma.TransactionClient, admissionId: string, bedId: string, userId: string) {
  // Verrou sur le lit : deux personnes ne peuvent pas attribuer le même lit en même temps
  const bed = (await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "Bed" WHERE id = ${bedId} FOR UPDATE`)[0];
  if (!bed) throw new ValidationError("Lit introuvable.", "bedId");
  if (bed.status !== "AVAILABLE") throw new ValidationError("Ce lit n'est pas disponible.", "bedId");
  const current = await tx.bedAssignment.findFirst({ where: { admissionId, endAt: null } });
  if (current) {
    await tx.bedAssignment.update({ where: { id: current.id }, data: { endAt: new Date() } });
    await tx.bed.update({ where: { id: current.bedId }, data: { status: "AVAILABLE" } });
  }
  await tx.bedAssignment.create({ data: { admissionId, bedId, assignedById: userId } });
  await tx.bed.update({ where: { id: bedId }, data: { status: "OCCUPIED" } });
}

/** Attribution ou transfert de lit (l'historique des mouvements est conservé). */
export async function assignBed(actor: Actor, admissionId: string, bedId: string) {
  assertCan(actor, "hospitalization", "update");
  const a = await db.admission.findUniqueOrThrow({ where: { id: admissionId } });
  if (a.status !== "ACTIVE") throw new ValidationError("Cette admission est terminée.");
  await db.$transaction(async (tx) => {
    await placeInBed(tx, admissionId, bedId, actor.userId);
    await audit(actor, { action: "BED", module: "hospitalization", entityType: "Admission", entityId: admissionId, details: { bedId } }, tx);
  });
}

export async function addNote(actor: Actor, admissionId: string, kind: string, content: string) {
  assertCan(actor, "hospitalization", "update");
  if (!content?.trim()) throw new ValidationError("La note est vide.", "content");
  const a = await db.admission.findUniqueOrThrow({ where: { id: admissionId } });
  if (a.status !== "ACTIVE") throw new ValidationError("Cette admission est terminée.");
  const n = await db.admissionNote.create({ data: { admissionId, authorId: actor.userId, kind: kind?.trim() || "Observation", content: content.trim().slice(0, 5000) } });
  await audit(actor, { action: "NOTE", module: "hospitalization", entityType: "Admission", entityId: admissionId });
  return n;
}

export const MATERNITY_CONTEXTS: { context: FormContext; label: string }[] = [
  { context: "MATERNITY_PRENATAL", label: "Suivi prénatal" }, { context: "MATERNITY_DELIVERY", label: "Accouchement" },
  { context: "MATERNITY_NEWBORN", label: "Nouveau-né" }, { context: "MATERNITY_POSTNATAL", label: "Suivi postnatal" },
];

/** Fiche de maternité : formulaire configurable (à valider par les responsables médicaux). */
export async function addMaternityRecord(actor: Actor, admissionId: string, context: FormContext, raw: Record<string, unknown>, notes?: string) {
  assertCan(actor, "hospitalization", "update");
  if (!MATERNITY_CONTEXTS.some((m) => m.context === context)) throw new ValidationError("Type de fiche invalide.");
  const a = await db.admission.findUniqueOrThrow({ where: { id: admissionId } });
  const form = await activeForm(null, context as never);
  const data = { ...validateFormData((form?.fields ?? []) as FormField[], raw), ...(notes?.trim() ? { notes: notes.trim().slice(0, 5000) } : {}) };
  const r = await db.maternityRecord.create({ data: { patientId: a.patientId, admissionId, context, formTemplateId: form?.id ?? null, data, recordedById: actor.userId } });
  await audit(actor, { action: "CREATE", module: "hospitalization", entityType: "MaternityRecord", entityId: r.id, details: { context } });
  return r;
}

/** Nouveau-né : fiche liée à l'accouchement ; un dossier patient propre peut être créé. */
export async function registerNewborn(actor: Actor, deliveryRecordId: string, raw: { firstName?: string; sex?: string; birthDate?: string; notes?: string; createRecord?: boolean }) {
  assertCan(actor, "hospitalization", "update");
  const delivery = await db.maternityRecord.findUniqueOrThrow({ where: { id: deliveryRecordId }, include: { patient: true } });
  if (delivery.context !== "MATERNITY_DELIVERY") throw new ValidationError("Le nouveau-né se rattache à une fiche d'accouchement.");
  let childPatientId: string | null = null;
  if (raw.createRecord) {
    const { createPatient } = await import("./patients");
    const r = await createPatient(actor, { lastName: delivery.patient.lastName, postName: delivery.patient.postName ?? undefined, firstName: raw.firstName?.trim() || "Nouveau-né", sex: raw.sex === "F" || raw.sex === "M" ? raw.sex : undefined, birthDate: raw.birthDate || new Date().toISOString().slice(0, 10), phone: delivery.patient.phone ?? undefined, address: delivery.patient.address ?? undefined }, { confirmedNotDuplicate: true });
    childPatientId = r.created ? r.patient.id : null;
  }
  const n = await db.newborn.create({ data: { deliveryRecordId, motherPatientId: delivery.patientId, childPatientId, data: { firstName: raw.firstName ?? null, sex: raw.sex ?? null, notes: raw.notes ?? null } } });
  await audit(actor, { action: "CREATE", module: "hospitalization", entityType: "Newborn", entityId: n.id, details: { childPatientId } });
  return n;
}

/** Frais de séjour : nombre de jours × tarif d'hospitalisation du catalogue (mis à jour, jamais dupliqué). */
export async function updateStayCharge(actor: Actor, admissionId: string) {
  const a = await db.admission.findUniqueOrThrow({ where: { id: admissionId } });
  const days = Math.max(1, Math.ceil(((a.dischargedAt ?? new Date()).getTime() - a.admittedAt.getTime()) / 86400e3));
  return db.$transaction(async (tx) => {
    const existing = await tx.charge.findFirst({ where: { source: "HOSPITALIZATION", sourceId: admissionId, status: "ACTIVE" } });
    if (existing) {
      if (existing.invoiceId) return existing; // déjà facturé : ne plus toucher
      return tx.charge.update({ where: { id: existing.id }, data: { quantity: days, total: existing.unitPrice.mul(days), description: `Séjour (${days} jour${days > 1 ? "s" : ""})` } });
    }
    return chargeFromTariff(tx, { patientId: a.patientId, visitId: a.visitId, admissionId, source: "HOSPITALIZATION", sourceId: admissionId, category: "HOSPITALIZATION", quantity: days, description: `Séjour (${days} jour${days > 1 ? "s" : ""})`, createdById: actor.userId });
  });
}

/**
 * Sortie : bloquée tant que la situation financière n'est pas réglée,
 * sauf crédit APPROUVÉ par le Directeur général.
 */
export async function discharge(actor: Actor, admissionId: string, notes?: string) {
  assertCan(actor, "hospitalization", "validate");
  const a = await db.admission.findUniqueOrThrow({ where: { id: admissionId } });
  if (a.status !== "ACTIVE") throw new ValidationError("Cette admission est déjà terminée.");
  await updateStayCharge(actor, admissionId);
  // Les factures couvertes par un crédit APPROUVÉ par le DG ne bloquent pas la sortie (voir financialClearance)
  const fin = await financialClearance(a.patientId);
  if (!fin.ok) {
    const why = fin.uninvoicedCharges ? "des prestations ne sont pas encore facturées" : `il reste ${fin.balance} à régler`;
    throw new ValidationError(`Sortie bloquée : ${why}. Le patient doit régler sa facture à la caisse, ou un crédit doit être approuvé par le Directeur général.`);
  }
  const credit = fin.creditApprovedInvoices.length
    ? await db.creditRequest.findFirst({ where: { patientId: a.patientId, status: "APPROVED", admission: null }, orderBy: { decidedAt: "desc" } })
    : null;
  await db.$transaction(async (tx) => {
    const open = await tx.bedAssignment.findFirst({ where: { admissionId, endAt: null } });
    if (open) { await tx.bedAssignment.update({ where: { id: open.id }, data: { endAt: new Date() } }); await tx.bed.update({ where: { id: open.bedId }, data: { status: "AVAILABLE" } }); }
    await tx.admission.update({ where: { id: admissionId }, data: { status: "DISCHARGED", dischargedAt: new Date(), dischargedById: actor.userId, dischargeNotes: notes?.trim() || null, dischargeCreditRequestId: credit?.id ?? null } });
    if (a.visitId) await tx.visit.update({ where: { id: a.visitId }, data: { status: "CLOSED", closedAt: new Date() } });
    await audit(actor, { action: "DISCHARGE", module: "hospitalization", entityType: "Admission", entityId: admissionId, details: { creditRequestId: credit?.id ?? null } }, tx);
  });
}

export async function listAdmissions(actor: Actor, status: "ACTIVE" | "DISCHARGED" = "ACTIVE") {
  assertCan(actor, "hospitalization", "view");
  return db.admission.findMany({
    where: { status }, orderBy: { admittedAt: status === "ACTIVE" ? "asc" : "desc" }, take: 200,
    include: { patient: true, bedAssignments: { where: { endAt: null }, include: { bed: { include: { room: true } } } } },
  });
}

export async function getAdmission(actor: Actor, id: string) {
  assertCan(actor, "hospitalization", "view");
  const a = await db.admission.findUnique({
    where: { id },
    include: {
      patient: true, decidedByDoctor: { select: { firstName: true, lastName: true } },
      bedAssignments: { orderBy: { startAt: "desc" }, include: { bed: { include: { room: true } } } },
      notes: { orderBy: { at: "desc" } }, maternityRecords: { orderBy: { recordedAt: "desc" }, include: { newborns: true, formTemplate: true } },
      charges: true,
    },
  });
  if (!a) return null;
  const authors = await db.user.findMany({ where: { id: { in: [...new Set([...a.notes.map((n) => n.authorId), ...a.maternityRecords.map((m) => m.recordedById)])] } }, select: { id: true, username: true } });
  return { ...a, authors: Object.fromEntries(authors.map((u) => [u.id, u.username])), canSeeMedical: can(actor, "hospitalization", "update") };
}

export async function hospitalStats() {
  const [active, beds] = await Promise.all([
    db.admission.groupBy({ by: ["type"], where: { status: "ACTIVE" }, _count: { _all: true } }),
    db.bed.groupBy({ by: ["status"], where: { room: { active: true } }, _count: { _all: true } }),
  ]);
  const c = (k: string) => beds.find((b) => b.status === k)?._count._all ?? 0;
  return { byType: Object.fromEntries(active.map((x) => [x.type, x._count._all])), available: c("AVAILABLE"), occupied: c("OCCUPIED"), outOfService: c("OUT_OF_SERVICE") };
}
