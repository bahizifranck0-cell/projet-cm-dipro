import { z } from "zod";
import type { LabRequestStatus } from "@prisma/client";
import { db } from "../db";
import { assertCan, can, ForbiddenError, ValidationError, type Actor } from "../auth/actor";
import { createPdf, fields as pdfFields, section, paragraph, table, signature } from "../pdf";
import { audit } from "./audit";
import { cancelChargesFor, chargeFromTariff } from "./charges";
import { documentNumber, storeDocument } from "./documents";
import { notify, notifyPermission, userOfEmployee } from "./notifications";
import { displayName, ageFrom } from "./patients";
import { nextNumber } from "./sequences";
import { opt, parse, req } from "./validation";

export const LAB_STATUS: Record<LabRequestStatus, string> = {
  REQUESTED: "Nouvelle demande", SAMPLED: "Prélevée", IN_PROGRESS: "En cours", AWAITING_VALIDATION: "À valider", VALIDATED: "Validée", CANCELLED: "Annulée",
};

// ── Catalogue (rempli par l'hôpital : aucune analyse ni valeur de référence inventée) ──
const testInput = z.object({ code: req("Le code", 20), name: req("Le nom", 120), category: opt(60), sampleType: opt(60), unit: opt(30), referenceRange: opt(120), tariffItemId: opt(40) });

export async function listLabTests(activeOnly = false) {
  return db.labTest.findMany({ where: activeOnly ? { active: true } : {}, orderBy: [{ category: "asc" }, { name: "asc" }], include: { tariffItem: true } });
}
export async function saveLabTest(actor: Actor, raw: unknown, id?: string) {
  assertCan(actor, "laboratory", "create");
  const d = parse(testInput, raw);
  const code = d.code.toUpperCase();
  if (await db.labTest.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } })) throw new ValidationError("Ce code d'analyse existe déjà.", "code");
  const data = { ...d, code, category: d.category ?? null, sampleType: d.sampleType ?? null, unit: d.unit ?? null, referenceRange: d.referenceRange ?? null, tariffItemId: d.tariffItemId ?? null };
  const t = id ? await db.labTest.update({ where: { id }, data }) : await db.labTest.create({ data });
  await audit(actor, { action: id ? "UPDATE" : "CREATE", module: "laboratory", entityType: "LabTest", entityId: t.id, details: { code, name: d.name } });
  return t;
}
export async function setLabTestActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "laboratory", "create");
  await db.labTest.update({ where: { id }, data: { active } });
  await audit(actor, { action: active ? "ACTIVATE" : "DEACTIVATE", module: "laboratory", entityType: "LabTest", entityId: id });
}

// ── Demande du médecin ──
export async function requestLab(actor: Actor, consultationId: string, testIds: string[], clinicalInfo?: string) {
  assertCan(actor, "laboratory", "create");
  const c = await db.consultation.findUnique({ where: { id: consultationId }, include: { patient: true } });
  if (!c) throw new ValidationError("Consultation introuvable.");
  if (c.doctorId !== actor.employeeId) throw new ForbiddenError("Seul le médecin de la consultation peut demander des examens.");
  const ids = [...new Set(testIds)];
  if (!ids.length) throw new ValidationError("Choisissez au moins une analyse.", "tests");
  const tests = await db.labTest.findMany({ where: { id: { in: ids }, active: true } });
  if (tests.length !== ids.length) throw new ValidationError("Une analyse choisie n'est plus disponible.", "tests");
  const y = new Date().getUTCFullYear();
  const r = await db.$transaction(async (tx) => {
    const r = await tx.labRequest.create({
      data: {
        number: `LAB-${y}-${String(await nextNumber(`LABREQ-${y}`, tx)).padStart(5, "0")}`,
        patientId: c.patientId, visitId: c.visitId, consultationId, requestedById: actor.userId, clinicalInfo: clinicalInfo?.trim() || null,
        items: { create: tests.map((t) => ({ labTestId: t.id, unit: t.unit, referenceRange: t.referenceRange })) },
      },
    });
    // Chaque analyse dont le tarif est configuré est ajoutée au compte du patient
    for (const t of tests) if (t.tariffItemId)
      await chargeFromTariff(tx, { patientId: c.patientId, visitId: c.visitId, source: "LAB", sourceId: r.id, category: "LAB", tariffItemId: t.tariffItemId, description: `Analyse — ${t.name}`, createdById: actor.userId });
    await audit(actor, { action: "CREATE", module: "laboratory", entityType: "LabRequest", entityId: r.id, details: { tests: tests.map((t) => t.code), patientId: c.patientId } }, tx);
    await notifyPermission("laboratory", "update", { module: "laboratory", type: "LAB_REQUEST", title: `Nouvelle demande ${r.number}`, body: `${displayName(c.patient)} — ${tests.map((t) => t.name).join(", ")}`, entityType: "LabRequest", entityId: r.id, link: `/laboratoire/${r.id}`, dedupeKey: `lab:${r.id}:new` }, tx, actor.userId);
    return r;
  });
  return r;
}

export async function listLabRequests(actor: Actor, status?: LabRequestStatus | "open") {
  assertCan(actor, "laboratory", "view");
  return db.labRequest.findMany({
    where: status === "open" ? { status: { in: ["REQUESTED", "SAMPLED", "IN_PROGRESS", "AWAITING_VALIDATION"] } } : status ? { status } : {},
    orderBy: { requestedAt: status === "VALIDATED" ? "desc" : "asc" }, take: 200,
    include: { patient: true, items: { include: { labTest: true } } },
  });
}

export async function getLabRequest(actor: Actor, id: string) {
  const r = await db.labRequest.findUnique({ where: { id }, include: { patient: true, items: { include: { labTest: true } }, samples: { orderBy: { collectedAt: "asc" } }, consultation: { include: { doctor: true, specialty: true } } } });
  if (!r) return null;
  // Labo, ou médecins autorisés aux consultations (le médecin demandeur consulte ses résultats)
  if (!can(actor, "laboratory", "view") && !can(actor, "consultations", "view")) throw new ForbiddenError();
  const users = await db.user.findMany({ where: { id: { in: [r.requestedById, r.validatedById ?? "", ...r.samples.map((s) => s.collectedById)] } }, select: { id: true, username: true, employee: { select: { firstName: true, lastName: true } } } });
  const name = (id?: string | null) => { const u = users.find((x) => x.id === id); return u ? (u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.username) : null; };
  const doc = r.status === "VALIDATED" ? await db.document.findFirst({ where: { entityType: "LabRequest", entityId: r.id }, orderBy: { version: "desc" } }) : null;
  return { ...r, requestedByName: name(r.requestedById), validatedByName: name(r.validatedById), sampleBy: (id: string) => name(id), documentId: doc?.id ?? null };
}

async function openRequest(id: string) {
  const r = await db.labRequest.findUnique({ where: { id }, include: { items: { include: { labTest: true } } } });
  if (!r) throw new ValidationError("Demande introuvable.");
  if (r.status === "VALIDATED" || r.status === "CANCELLED") throw new ValidationError("Cette demande est clôturée.");
  return r;
}

export async function recordSample(actor: Actor, id: string, sampleTypeRaw: string, notes?: string) {
  assertCan(actor, "laboratory", "update");
  const r = await openRequest(id);
  const sampleType = sampleTypeRaw?.trim();
  if (!sampleType) throw new ValidationError("Indiquez le type d'échantillon.", "sampleType");
  await db.$transaction([
    db.labSample.create({ data: { labRequestId: id, sampleType, collectedById: actor.userId, notes: notes?.trim() || null } }),
    db.labRequest.update({ where: { id }, data: { status: r.status === "REQUESTED" ? "SAMPLED" : r.status } }),
  ]);
  await audit(actor, { action: "SAMPLE", module: "laboratory", entityType: "LabRequest", entityId: id, details: { sampleType } });
}

const resultsInput = z.object({
  items: z.array(z.object({ id: z.string(), resultValue: opt(500), flag: z.enum(["", "normal", "bas", "élevé", "anormal"]).optional(), observation: opt(500) })),
  conclusion: opt(2000),
  submit: z.boolean().default(false),
});

/** Saisie des résultats ; « soumettre » les envoie en validation (tous les résultats requis). */
export async function enterResults(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "laboratory", "update");
  const r = await openRequest(id);
  const d = parse(resultsInput, raw);
  const known = new Set(r.items.map((i) => i.id));
  if (d.items.some((i) => !known.has(i.id))) throw new ValidationError("Résultat inconnu pour cette demande.");
  if (d.submit) {
    const filled = new Map(d.items.map((i) => [i.id, i.resultValue]));
    const missing = r.items.filter((i) => !(filled.get(i.id) ?? i.resultValue));
    if (missing.length) throw new ValidationError(`Résultat manquant : ${missing.map((m) => m.labTest.name).join(", ")}.`);
  }
  await db.$transaction(async (tx) => {
    for (const i of d.items) await tx.labRequestItem.update({ where: { id: i.id }, data: { resultValue: i.resultValue ?? null, flag: i.flag || null, observation: i.observation ?? null, enteredById: actor.userId, enteredAt: new Date() } });
    await tx.labRequest.update({ where: { id }, data: { conclusion: d.conclusion ?? null, status: d.submit ? "AWAITING_VALIDATION" : "IN_PROGRESS" } });
  });
  await audit(actor, { action: d.submit ? "SUBMIT" : "RESULTS", module: "laboratory", entityType: "LabRequest", entityId: id });
  if (d.submit) await notifyPermission("laboratory", "validate", { module: "laboratory", type: "LAB_TO_VALIDATE", title: `Résultats à valider (${r.number})`, entityType: "LabRequest", entityId: id, link: `/laboratoire/${id}`, dedupeKey: `lab:${id}:validate` }, db, actor.userId);
}

/** Validation par le responsable : résultat officiel, PDF, dossier patient, médecin notifié. */
export async function validateResults(actor: Actor, id: string) {
  assertCan(actor, "laboratory", "validate");
  const r = await openRequest(id);
  if (r.status !== "AWAITING_VALIDATION") throw new ValidationError("Les résultats doivent d'abord être saisis et soumis.");
  if (r.items.some((i) => !i.resultValue)) throw new ValidationError("Tous les résultats doivent être saisis.");
  await db.labRequest.update({ where: { id }, data: { status: "VALIDATED", validatedById: actor.userId, validatedAt: new Date() } });
  await audit(actor, { action: "VALIDATE", module: "laboratory", entityType: "LabRequest", entityId: id });
  const doc = await labResultPdf(actor, id);
  const c = r.consultationId ? await db.consultation.findUnique({ where: { id: r.consultationId } }) : null;
  const doctorUser = (await userOfEmployee(c?.doctorId)) ?? r.requestedById;
  await notify([doctorUser], { module: "consultations", type: "LAB_RESULT", title: `Résultats disponibles (${r.number})`, entityType: "LabRequest", entityId: id, link: `/laboratoire/${id}`, dedupeKey: `lab:${id}:result` });
  return doc;
}

export async function cancelLabRequest(actor: Actor, id: string, reason: string) {
  assertCan(actor, "laboratory", "update");
  if (!reason?.trim()) throw new ValidationError("Indiquez le motif de l'annulation.", "reason");
  await openRequest(id);
  await db.$transaction(async (tx) => {
    await tx.labRequest.update({ where: { id }, data: { status: "CANCELLED", conclusion: `Annulée : ${reason.trim()}` } });
    await cancelChargesFor(tx, "LAB", id, actor.userId, reason.trim());
    await audit(actor, { action: "CANCEL", module: "laboratory", entityType: "LabRequest", entityId: id, details: { reason } }, tx);
  });
}

export async function labResultPdf(actor: Actor, id: string) {
  const r = await db.labRequest.findUniqueOrThrow({ where: { id }, include: { patient: true, items: { include: { labTest: true } }, samples: true, consultation: { include: { doctor: true } } } });
  const validator = r.validatedById ? await db.user.findUnique({ where: { id: r.validatedById }, include: { employee: true } }) : null;
  const vName = validator?.employee ? `${validator.employee.firstName} ${validator.employee.lastName.toUpperCase()}` : validator?.username ?? "";
  const number = await documentNumber("LAB_RESULT");
  const age = ageFrom(r.patient.birthDate);
  const pdf = await createPdf({ title: "Résultats d'analyses de laboratoire", reference: r.number, date: r.validatedAt ?? new Date() }, (doc) => {
    pdfFields(doc, [["Patient", displayName(r.patient)], ["N° de dossier", r.patient.patientNumber],
      ["Âge / sexe", `${age !== null ? `${age} ans` : "—"}${r.patient.sex ? ` / ${r.patient.sex}` : ""}`], ["Médecin demandeur", r.consultation ? `Dr ${r.consultation.doctor.lastName.toUpperCase()} ${r.consultation.doctor.firstName}` : null],
      ["Date de la demande", r.requestedAt.toLocaleDateString("fr-FR")], ["Prélèvement", r.samples.map((s) => s.sampleType).join(", ") || null]]);
    if (r.clinicalInfo) { section(doc, "Renseignements cliniques"); paragraph(doc, r.clinicalInfo); }
    section(doc, "Résultats");
    table(doc, ["Analyse", "Résultat", "Unité", "Valeurs de référence", "Interprétation"], [150, 100, 60, 105, 80],
      r.items.map((i) => [i.labTest.name + (i.observation ? `\n${i.observation}` : ""), i.resultValue ?? "", i.unit ?? "", i.referenceRange ?? "", i.flag ?? ""]));
    if (r.conclusion) { section(doc, "Conclusion"); paragraph(doc, r.conclusion); }
    signature(doc, `Validé le ${(r.validatedAt ?? new Date()).toLocaleDateString("fr-FR")} par le responsable du laboratoire`, vName);
  });
  return storeDocument({ type: "LAB_RESULT", title: `Résultats ${r.number}`, pdf, number, createdById: actor.userId, patientId: r.patientId, entityType: "LabRequest", entityId: r.id, visibleToPatient: r.patientVisible });
}

export async function patientLabRequests(actor: Actor, patientId: string) {
  if (!can(actor, "laboratory", "view") && !can(actor, "consultations", "view")) return [];
  return db.labRequest.findMany({ where: { patientId }, orderBy: { requestedAt: "desc" }, include: { items: { include: { labTest: true } } } });
}

export async function labStats() {
  const rows = await db.labRequest.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<Record<LabRequestStatus, number>>;
}
