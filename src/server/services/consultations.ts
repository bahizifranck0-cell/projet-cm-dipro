import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { assertCan, can, ForbiddenError, ValidationError, type Actor } from "../auth/actor";
import { createPdf, fields as pdfFields, section, paragraph, table, signature } from "../pdf";
import { audit } from "./audit";
import { chargeFromTariff } from "./charges";
import { documentNumber, storeDocument } from "./documents";
import { notify, userOfEmployee } from "./notifications";
import { displayName, ageFrom } from "./patients";
import { validateFormData, type FormField } from "./specialties";
import { opt, parse } from "./validation";

/** Affectations médicales actives de l'utilisateur (un médecin peut en avoir plusieurs si l'administration le décide). */
export async function myAssignments(actor: Actor) {
  if (!actor.employeeId) return [];
  return db.doctorAssignment.findMany({ where: { employeeId: actor.employeeId, active: true, specialty: { active: true } }, include: { specialty: true, department: true } });
}

/** Patients à recevoir : orientés vers moi, ou vers un service de mes spécialités sans médecin désigné. */
export async function doctorQueue(actor: Actor) {
  assertCan(actor, "consultations", "view");
  const asg = await myAssignments(actor);
  const deptIds = new Set<string>();
  for (const a of asg) {
    if (a.departmentId) deptIds.add(a.departmentId);
    (await db.specialtyDepartment.findMany({ where: { specialtyId: a.specialtyId } })).forEach((d) => deptIds.add(d.departmentId));
  }
  const me = actor.employeeId ?? "__none__";
  return db.visit.findMany({
    where: {
      OR: [
        { status: { in: ["WAITING", "ORIENTED"] }, orientedToDoctorId: me },
        { status: { in: ["WAITING", "ORIENTED"] }, orientedToDoctorId: null, orientedToDepartmentId: { in: [...deptIds] } },
        { status: "IN_CONSULTATION", consultations: { some: { doctorId: me, status: "DRAFT" } } },
      ],
    },
    orderBy: [{ priority: "desc" }, { arrivedAt: "asc" }],
    include: { patient: true, orientedToDepartment: true, consultations: { where: { status: "DRAFT" }, select: { id: true, doctorId: true } } },
  });
}

export async function startConsultation(actor: Actor, visitId: string, specialtyId: string) {
  assertCan(actor, "consultations", "create");
  if (!actor.employeeId) throw new ForbiddenError("Votre compte n'est pas rattaché à un dossier employé.");
  const asg = (await myAssignments(actor)).find((a) => a.specialtyId === specialtyId);
  if (!asg) throw new ForbiddenError("Vous n'êtes pas affecté à cette spécialité.");
  const visit = await db.visit.findUnique({ where: { id: visitId } });
  if (!visit) throw new ValidationError("Passage introuvable.");
  const existing = await db.consultation.findFirst({ where: { visitId, doctorId: actor.employeeId, status: "DRAFT" } });
  if (existing) return existing;
  if (!["WAITING", "ORIENTED", "IN_CONSULTATION"].includes(visit.status)) throw new ValidationError("Ce passage est clôturé.");
  const form = await db.formTemplate.findFirst({ where: { specialtyId, context: "CONSULTATION", active: true }, orderBy: { version: "desc" } });
  const c = await db.$transaction(async (tx) => {
    const c = await tx.consultation.create({ data: { visitId, patientId: visit.patientId, doctorId: actor.employeeId!, specialtyId, formTemplateId: form?.id ?? null } });
    await tx.visit.update({ where: { id: visitId }, data: { status: "IN_CONSULTATION" } });
    await audit(actor, { action: "CREATE", module: "consultations", entityType: "Consultation", entityId: c.id, details: { patientId: visit.patientId, specialtyId } }, tx);
    return c;
  });
  return c;
}

/** Contrôle de confidentialité : spécialité confidentielle = auteur ou médecin de la même spécialité. */
export async function canViewConsultation(actor: Actor, c: { doctorId: string; specialtyId: string; specialty?: { confidential: boolean } | null }) {
  if (!can(actor, "consultations", "view")) return false;
  const spec = c.specialty ?? (await db.specialty.findUnique({ where: { id: c.specialtyId } }));
  if (!spec?.confidential) return true;
  if (actor.employeeId === c.doctorId) return true;
  return (await myAssignments(actor)).some((a) => a.specialtyId === c.specialtyId);
}

export async function getConsultation(actor: Actor, id: string) {
  const c = await db.consultation.findUnique({
    where: { id },
    include: {
      patient: true, specialty: true, formTemplate: true, visit: true,
      doctor: { select: { id: true, firstName: true, lastName: true } },
      prescriptions: { include: { items: true }, orderBy: { createdAt: "asc" } },
      referrals: { include: { toDepartment: true, toSpecialty: true, toDoctor: { select: { firstName: true, lastName: true } } } },
      appointments: true,
    },
  });
  if (!c) return null;
  if (!(await canViewConsultation(actor, c))) throw new ForbiddenError("Consultation confidentielle : réservée aux médecins de cette spécialité.");
  return c;
}

export async function patientConsultations(actor: Actor, patientId: string) {
  if (!can(actor, "consultations", "view")) return [];
  const list = await db.consultation.findMany({
    where: { patientId, status: { not: "CANCELLED" } }, orderBy: { startedAt: "desc" },
    include: { specialty: true, doctor: { select: { firstName: true, lastName: true } }, prescriptions: { include: { items: true } } },
  });
  const out = [];
  for (const c of list) out.push({ ...c, hidden: !(await canViewConsultation(actor, c)) });
  return out.map((c) => (c.hidden ? { ...c, observations: null, diagnosis: null, treatment: null, formData: null, prescriptions: [] } : c));
}

async function ownDraft(actor: Actor, id: string) {
  const c = await db.consultation.findUnique({ where: { id }, include: { formTemplate: true, specialty: true } });
  if (!c) throw new ValidationError("Consultation introuvable.");
  if (c.doctorId !== actor.employeeId) throw new ForbiddenError("Seul le médecin auteur peut modifier cette consultation.");
  if (c.status !== "DRAFT") throw new ValidationError("Cette consultation est signée : elle ne peut plus être modifiée.");
  return c;
}

const saveInput = z.object({ observations: opt(8000), diagnosis: opt(2000), treatment: opt(4000), patientVisible: z.coerce.boolean().default(false), form: z.record(z.string(), z.unknown()).default({}) });

export async function saveConsultation(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "consultations", "update");
  const c = await ownDraft(actor, id);
  const d = parse(saveInput, raw);
  const fields = (c.formTemplate?.fields ?? []) as FormField[];
  // Brouillon : pas de contrôle des champs obligatoires (vérifiés à la signature)
  const formData = validateFormData(fields.map((f) => ({ ...f, required: false })), d.form);
  await db.consultation.update({ where: { id }, data: { observations: d.observations ?? null, diagnosis: d.diagnosis ?? null, treatment: d.treatment ?? null, patientVisible: d.patientVisible, formData } });
  await audit(actor, { action: "UPDATE", module: "consultations", entityType: "Consultation", entityId: id });
}

const rxItem = z.object({ medication: z.string().trim().min(1, "Indiquez le médicament.").max(120), dosage: opt(80), frequency: opt(80), duration: opt(80), instructions: opt(300), productId: opt(40) });

export async function addPrescription(actor: Actor, consultationId: string, itemsRaw: unknown, notes?: string) {
  assertCan(actor, "consultations", "update");
  const c = await ownDraft(actor, consultationId);
  const items = parse(z.array(rxItem).min(1, "Ajoutez au moins un médicament.").max(30), itemsRaw);
  const p = await db.prescription.create({ data: { consultationId, patientId: c.patientId, prescriberId: actor.employeeId!, notes: notes?.trim() || null, items: { create: items } } });
  await audit(actor, { action: "CREATE", module: "consultations", entityType: "Prescription", entityId: p.id, details: { items: items.length } });
  return p;
}

export async function removePrescription(actor: Actor, prescriptionId: string) {
  assertCan(actor, "consultations", "update");
  const p = await db.prescription.findUniqueOrThrow({ where: { id: prescriptionId } });
  if (!p.consultationId) throw new ValidationError("Ordonnance introuvable.");
  await ownDraft(actor, p.consultationId);
  await db.prescription.delete({ where: { id: prescriptionId } }); // brouillon non signé : pas encore un document officiel
  await audit(actor, { action: "DELETE", module: "consultations", entityType: "Prescription", entityId: prescriptionId });
}

const referInput = z.object({ toDepartmentId: opt(40), toSpecialtyId: opt(40), toDoctorId: opt(40), reason: opt(500) });

export async function referPatient(actor: Actor, consultationId: string, raw: unknown) {
  assertCan(actor, "consultations", "update");
  const c = await ownDraft(actor, consultationId);
  const d = parse(referInput, raw);
  if (!d.toDepartmentId && !d.toSpecialtyId && !d.toDoctorId) throw new ValidationError("Choisissez un service, une spécialité ou un médecin.", "toDepartmentId");
  const r = await db.referral.create({ data: { patientId: c.patientId, visitId: c.visitId, consultationId, fromUserId: actor.userId, ...d } });
  await audit(actor, { action: "REFER", module: "consultations", entityType: "Referral", entityId: r.id, details: d });
  return r;
}

/** Signature : champs obligatoires vérifiés, consultation verrouillée, tarif appliqué, ordonnances en PDF, suite du passage. */
export async function signConsultation(actor: Actor, id: string, opts: { closeVisit: boolean }) {
  assertCan(actor, "consultations", "validate");
  const c = await ownDraft(actor, id);
  const fields = (c.formTemplate?.fields ?? []) as FormField[];
  validateFormData(fields, (c.formData ?? {}) as Record<string, unknown>);
  if (!c.diagnosis?.trim() && !c.observations?.trim()) throw new ValidationError("Renseignez au moins les observations ou le diagnostic avant de signer.", "diagnosis");

  const referral = await db.referral.findFirst({ where: { consultationId: id }, orderBy: { createdAt: "desc" } });
  const result = await db.$transaction(async (tx) => {
    await tx.consultation.update({ where: { id }, data: { status: "SIGNED", signedAt: new Date() } });
    const charge = await chargeFromTariff(tx, { patientId: c.patientId, visitId: c.visitId, source: "CONSULTATION", sourceId: id, category: "CONSULTATION", specialtyId: c.specialtyId, createdById: actor.userId, description: `Consultation — ${c.specialty.name}` });
    const visit = await tx.visit.findUniqueOrThrow({ where: { id: c.visitId } });
    if (visit.status === "IN_CONSULTATION") { // (un passage « ADMITTED » reste ouvert jusqu'à la sortie)
      if (referral) {
        await tx.visit.update({ where: { id: c.visitId }, data: { status: "ORIENTED", orientedToDepartmentId: referral.toDepartmentId, orientedToDoctorId: referral.toDoctorId } });
      } else if (opts.closeVisit) {
        await tx.visit.update({ where: { id: c.visitId }, data: { status: "CLOSED", closedAt: new Date() } });
      }
    }
    await audit(actor, { action: "SIGN", module: "consultations", entityType: "Consultation", entityId: id, details: { charged: !!charge, referral: referral?.id ?? null } }, tx);
    return { charged: !!charge };
  });
  if (referral?.toDoctorId) {
    const u = await userOfEmployee(referral.toDoctorId);
    if (u) await notify([u], { module: "consultations", type: "REFERRAL", title: "Patient orienté vers vous", body: referral.reason ?? undefined, entityType: "Visit", entityId: c.visitId, link: "/medecin", dedupeKey: `ref:${referral.id}` });
  }
  await generatePrescriptionPdfs(actor, id);
  return result;
}

export async function generatePrescriptionPdfs(actor: Actor, consultationId: string) {
  const c = await db.consultation.findUniqueOrThrow({ where: { id: consultationId }, include: { patient: true, doctor: true, specialty: true, prescriptions: { include: { items: true } } } });
  for (const p of c.prescriptions) {
    if (await db.document.findFirst({ where: { entityType: "Prescription", entityId: p.id } })) continue;
    const number = await documentNumber("PRESCRIPTION");
    const age = ageFrom(c.patient.birthDate);
    const pdf = await createPdf({ title: "Ordonnance médicale", reference: number, date: c.signedAt ?? new Date(), subtitle: c.specialty.name }, (doc) => {
      pdfFields(doc, [["Patient", displayName(c.patient)], ["N° de dossier", c.patient.patientNumber], ["Âge", age !== null ? `${age} ans` : null], ["Prescripteur", `Dr ${c.doctor.lastName.toUpperCase()} ${c.doctor.firstName}`]]);
      section(doc, "Prescription");
      table(doc, ["Médicament", "Posologie", "Fréquence", "Durée"], [175, 110, 110, 100], p.items.map((i) => [i.medication + (i.instructions ? `\n${i.instructions}` : ""), i.dosage ?? "", i.frequency ?? "", i.duration ?? ""]));
      if (p.notes) { section(doc, "Remarques"); paragraph(doc, p.notes); }
      signature(doc, "Signature et cachet du médecin", `Dr ${c.doctor.lastName.toUpperCase()} ${c.doctor.firstName}`);
    });
    await storeDocument({ type: "PRESCRIPTION", title: `Ordonnance — ${displayName(c.patient)}`, pdf, number, createdById: actor.userId, patientId: c.patientId, entityType: "Prescription", entityId: p.id, visibleToPatient: true });
  }
}

export type ConsultationWithForm = Prisma.ConsultationGetPayload<{ include: { formTemplate: true } }>;
