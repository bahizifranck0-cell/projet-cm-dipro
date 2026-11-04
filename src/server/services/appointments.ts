import { z } from "zod";
import type { AppointmentStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { assertCan, ValidationError, type Actor } from "../auth/actor";
import { createPdf, fields as pdfFields, section, paragraph, fmtDate } from "../pdf";
import { audit } from "./audit";
import { documentNumber, storeDocument } from "./documents";
import { notify, userOfEmployee } from "./notifications";
import { displayName } from "./patients";
import { listDoctors } from "./reception";
import { nextNumber } from "./sequences";
import { opt, parse, req } from "./validation";

export const APPT_STATUS: Record<AppointmentStatus, string> = { SCHEDULED: "Prévu", HONORED: "Honoré", MISSED: "Manqué", CANCELLED: "Annulé", RESCHEDULED: "Reporté" };

const when = z.string().trim().min(1, "La date et l'heure sont obligatoires.").transform((v, ctx) => {
  // Saisie locale (Goma, UTC+2) au format AAAA-MM-JJTHH:MM
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 2, +m[5])) : new Date(NaN);
  if (Number.isNaN(d.getTime())) { ctx.addIssue({ code: "custom", message: "Date ou heure invalide." }); return z.NEVER; }
  if (d.getTime() < Date.now() - 5 * 60e3) { ctx.addIssue({ code: "custom", message: "Le rendez-vous doit être dans le futur." }); return z.NEVER; }
  return d;
});

const createInput = z.object({ patientId: req("Le patient", 40), doctorId: req("Le médecin", 40), specialtyId: opt(40), scheduledAt: when, reason: req("Le motif", 300), notes: opt(1000), consultationId: opt(40) });

async function apptNumber() { const y = new Date().getUTCFullYear(); return `RDV-${y}-${String(await nextNumber(`RDV-${y}`)).padStart(5, "0")}`; }

export async function createAppointment(actor: Actor, raw: unknown) {
  assertCan(actor, "appointments", "create");
  const d = parse(createInput, raw);
  if (!(await db.patient.findUnique({ where: { id: d.patientId } }))) throw new ValidationError("Patient introuvable.");
  if (!(await listDoctors()).some((x) => x.id === d.doctorId)) throw new ValidationError("Médecin indisponible.", "doctorId");
  const clash = await db.appointment.findFirst({ where: { doctorId: d.doctorId, scheduledAt: d.scheduledAt, status: "SCHEDULED" } });
  if (clash) throw new ValidationError("Ce médecin a déjà un rendez-vous à cette heure-là.", "scheduledAt");
  const a = await db.appointment.create({ data: { ...d, number: await apptNumber(), createdById: actor.userId, events: { create: { status: "SCHEDULED", byUserId: actor.userId } } } });
  await audit(actor, { action: "CREATE", module: "appointments", entityType: "Appointment", entityId: a.id, details: { patientId: d.patientId, at: d.scheduledAt.toISOString() } });
  const u = await userOfEmployee(d.doctorId);
  if (u && u !== actor.userId) await notify([u], { module: "appointments", type: "NEW", title: "Nouveau rendez-vous", body: fmtDate(d.scheduledAt), entityType: "Appointment", entityId: a.id, link: "/rendez-vous", dedupeKey: `appt:${a.id}` });
  await appointmentPdf(actor, a.id);
  return a;
}

async function change(actor: Actor, id: string, status: AppointmentStatus, reason?: string) {
  const a = await db.appointment.findUnique({ where: { id } });
  if (!a) throw new ValidationError("Rendez-vous introuvable.");
  if (a.status !== "SCHEDULED") throw new ValidationError("Seul un rendez-vous prévu peut être modifié.");
  await db.appointment.update({ where: { id }, data: { status, events: { create: { status, reason, byUserId: actor.userId } } } });
  await audit(actor, { action: status, module: "appointments", entityType: "Appointment", entityId: id, details: { reason: reason ?? null } });
  return a;
}

export async function cancelAppointment(actor: Actor, id: string, reason: string) {
  assertCan(actor, "appointments", "update");
  if (!reason?.trim()) throw new ValidationError("Indiquez le motif de l'annulation.", "reason");
  return change(actor, id, "CANCELLED", reason.trim());
}

export async function markMissed(actor: Actor, id: string) { assertCan(actor, "appointments", "update"); return change(actor, id, "MISSED"); }

/** Report : l'ancien rendez-vous reste dans l'historique, un nouveau est créé et lié. */
export async function rescheduleAppointment(actor: Actor, id: string, raw: { scheduledAt: string; reason?: string }) {
  assertCan(actor, "appointments", "update");
  const scheduledAt = parse(when, raw.scheduledAt);
  const old = await change(actor, id, "RESCHEDULED", raw.reason?.trim() || "Report");
  const a = await db.appointment.create({
    data: { number: await apptNumber(), patientId: old.patientId, doctorId: old.doctorId, specialtyId: old.specialtyId, departmentId: old.departmentId, consultationId: old.consultationId,
      scheduledAt, reason: old.reason, notes: old.notes, createdById: actor.userId, rescheduledFromId: old.id, events: { create: { status: "SCHEDULED", reason: "Report", byUserId: actor.userId } } },
  });
  await audit(actor, { action: "CREATE", module: "appointments", entityType: "Appointment", entityId: a.id, details: { rescheduledFrom: old.number } });
  await appointmentPdf(actor, a.id);
  return a;
}

/** Appelé à l'arrivée du patient. */
export async function markHonored(actorUserId: string, id: string, tx: Prisma.TransactionClient) {
  await tx.appointment.update({ where: { id }, data: { status: "HONORED", events: { create: { status: "HONORED", byUserId: actorUserId } } } });
}

export async function listAppointments(actor: Actor, f: { from?: Date; to?: Date; doctorId?: string; status?: AppointmentStatus; patientId?: string; q?: string }) {
  assertCan(actor, "appointments", "view");
  return db.appointment.findMany({
    where: {
      scheduledAt: { gte: f.from, lt: f.to }, doctorId: f.doctorId, status: f.status, patientId: f.patientId,
      ...(f.q ? { OR: [{ number: { contains: f.q.toUpperCase() } }, { patient: { searchName: { contains: f.q.toLowerCase() } } }, { patient: { patientNumber: { contains: f.q.toUpperCase() } } }] } : {}),
    },
    orderBy: { scheduledAt: "asc" }, take: 300,
    include: { patient: true, doctor: { select: { firstName: true, lastName: true } }, specialty: true },
  });
}

export async function appointmentPdf(actor: Actor, id: string) {
  const a = await db.appointment.findUniqueOrThrow({ where: { id }, include: { patient: true, doctor: true, specialty: true } });
  const number = await documentNumber("APPOINTMENT");
  const pdf = await createPdf({ title: "Rendez-vous", reference: a.number, date: new Date() }, (doc) => {
    pdfFields(doc, [["Patient", displayName(a.patient)], ["N° de dossier", a.patient.patientNumber],
      ["Date et heure", fmtDate(a.scheduledAt)], ["Médecin", `Dr ${a.doctor.lastName.toUpperCase()} ${a.doctor.firstName}`],
      ["Spécialité", a.specialty?.name], ["Référence", a.number]]);
    section(doc, "Motif"); paragraph(doc, a.reason);
    if (a.notes) { section(doc, "Informations complémentaires"); paragraph(doc, a.notes); }
    section(doc, "À présenter à l'accueil"); paragraph(doc, "Merci de vous présenter à l'accueil avec ce document quelques minutes avant l'heure prévue.");
  });
  return storeDocument({ type: "APPOINTMENT", title: `Rendez-vous ${a.number}`, pdf, number, createdById: actor.userId, patientId: a.patientId, entityType: "Appointment", entityId: a.id, visibleToPatient: true });
}
