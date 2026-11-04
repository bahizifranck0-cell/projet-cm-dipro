import { z } from "zod";
import { Prisma, type VisitStatus } from "@prisma/client";
import { db } from "../db";
import { assertCan, can, ForbiddenError, ValidationError, type Actor } from "../auth/actor";
import { todayBounds } from "@/lib/normalize";
import { audit } from "./audit";
import { opt, parse } from "./validation";

export const OPEN_STATUSES: VisitStatus[] = ["WAITING", "ORIENTED", "IN_CONSULTATION", "ADMITTED"];

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  WAITING: "En attente d'orientation", ORIENTED: "Orienté", IN_CONSULTATION: "En consultation",
  ADMITTED: "Hospitalisé", CLOSED: "Terminé", CANCELLED: "Annulé",
};

/** Médecins pouvant recevoir un patient : affectation médicale active ou compte au rôle Médecin. */
export async function listDoctors() {
  return db.employee.findMany({
    where: { status: "ACTIVE", OR: [{ doctorAssignments: { some: { active: true } } }, { user: { status: "ACTIVE", role: { code: "MEDECIN" } } }] },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, departmentId: true, doctorAssignments: { where: { active: true }, select: { specialty: { select: { name: true } } } } },
  });
}

const orientInput = z.object({ departmentId: opt(40), doctorId: opt(40) });
const arrivalInput = orientInput.extend({ reason: opt(300), priority: z.coerce.boolean().default(false), appointmentId: opt(40) });

async function checkTargets(departmentId?: string, doctorId?: string) {
  if (departmentId && !(await db.department.findFirst({ where: { id: departmentId, active: true } })))
    throw new ValidationError("Service introuvable ou désactivé.", "departmentId");
  if (doctorId && !(await listDoctors()).some((d) => d.id === doctorId))
    throw new ValidationError("Ce médecin n'est pas disponible.", "doctorId");
}

/** Enregistre l'arrivée d'un patient (avec ou sans rendez-vous) et, si possible, son orientation. */
export async function registerArrival(actor: Actor, patientId: string, raw: unknown) {
  assertCan(actor, "reception", "create");
  const d = parse(arrivalInput, raw);
  if (!(await db.patient.findUnique({ where: { id: patientId } }))) throw new ValidationError("Dossier patient introuvable.");
  const open = await db.visit.findFirst({ where: { patientId, status: { in: OPEN_STATUSES } } });
  if (open) throw new ValidationError("Ce patient a déjà un passage en cours : orientez-le depuis la file d'attente.");
  // Arrivée sur rendez-vous : orientation reprise du rendez-vous, qui passe à « honoré »
  const appt = d.appointmentId ? await db.appointment.findFirst({ where: { id: d.appointmentId, patientId, status: "SCHEDULED" } }) : null;
  if (d.appointmentId && !appt) throw new ValidationError("Rendez-vous introuvable ou déjà traité.");
  if (appt) { d.doctorId ??= appt.doctorId; d.departmentId ??= appt.departmentId ?? undefined; d.reason ??= `Rendez-vous ${appt.number} — ${appt.reason}`; }
  await checkTargets(d.departmentId, d.doctorId);
  try {
    const visit = await db.$transaction(async (tx) => {
      const v = await tx.visit.create({
        data: {
          patientId, reason: d.reason, priority: d.priority, registeredById: actor.userId,
          orientedToDepartmentId: d.departmentId, orientedToDoctorId: d.doctorId,
          status: d.departmentId || d.doctorId ? "ORIENTED" : "WAITING",
        },
      });
      if (appt) await tx.appointment.update({ where: { id: appt.id }, data: { status: "HONORED", events: { create: { status: "HONORED", byUserId: actor.userId } } } });
      return v;
    });
    await audit(actor, { action: "ARRIVAL", module: "reception", entityType: "Visit", entityId: visit.id, details: { patientId, ...d } });
    return visit;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new ValidationError("Ce patient a déjà un passage en cours : orientez-le depuis la file d'attente.");
    throw e;
  }
}

export async function orientVisit(actor: Actor, visitId: string, raw: unknown) {
  assertCan(actor, "reception", "update");
  const d = parse(orientInput, raw);
  if (!d.departmentId && !d.doctorId) throw new ValidationError("Choisissez un service ou un médecin.", "departmentId");
  const v = await db.visit.findUnique({ where: { id: visitId } });
  if (!v) throw new ValidationError("Passage introuvable.");
  if (v.status !== "WAITING" && v.status !== "ORIENTED") throw new ValidationError("Ce passage ne peut plus être réorienté depuis l'accueil.");
  await checkTargets(d.departmentId, d.doctorId);
  await db.visit.update({ where: { id: visitId }, data: { orientedToDepartmentId: d.departmentId ?? null, orientedToDoctorId: d.doctorId ?? null, status: "ORIENTED" } });
  await audit(actor, {
    action: "ORIENT", module: "reception", entityType: "Visit", entityId: visitId,
    details: { before: { departmentId: v.orientedToDepartmentId, doctorId: v.orientedToDoctorId }, after: d },
  });
}

export async function cancelVisit(actor: Actor, visitId: string, reasonRaw: string) {
  assertCan(actor, "reception", "update");
  const reason = reasonRaw?.trim();
  if (!reason) throw new ValidationError("Indiquez le motif de l'annulation.", "reason");
  const v = await db.visit.findUnique({ where: { id: visitId } });
  if (!v) throw new ValidationError("Passage introuvable.");
  if (v.status !== "WAITING" && v.status !== "ORIENTED") throw new ValidationError("Seul un passage pas encore pris en charge peut être annulé à l'accueil.");
  await db.visit.update({ where: { id: visitId }, data: { status: "CANCELLED", cancelReason: reason.slice(0, 300), closedAt: new Date() } });
  await audit(actor, { action: "CANCEL", module: "reception", entityType: "Visit", entityId: visitId, details: { reason } });
}

/** File du jour : passages arrivés aujourd'hui + passages encore ouverts des jours précédents (service 24 h/24). */
export async function listQueue(actor: Actor, opts: { status?: "open" | "all" } = {}) {
  if (!can(actor, "reception", "view") && !can(actor, "consultations", "view")) throw new ForbiddenError();
  const { start } = todayBounds();
  const where: Prisma.VisitWhereInput = opts.status === "all"
    ? { OR: [{ arrivedAt: { gte: start } }, { status: { in: OPEN_STATUSES } }] }
    : { status: { in: OPEN_STATUSES } };
  return db.visit.findMany({
    where,
    orderBy: [{ priority: "desc" }, { arrivedAt: "asc" }],
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, postName: true, sex: true, birthDate: true } },
      orientedToDepartment: { select: { name: true } },
      orientedToDoctor: { select: { firstName: true, lastName: true } },
    },
    take: 300,
  });
}

export async function receptionStats() {
  const { start } = todayBounds();
  const [arrivals, waiting, oriented, inConsultation] = await Promise.all([
    db.visit.count({ where: { arrivedAt: { gte: start } } }),
    db.visit.count({ where: { status: "WAITING" } }),
    db.visit.count({ where: { status: "ORIENTED" } }),
    db.visit.count({ where: { status: "IN_CONSULTATION" } }),
  ]);
  return { arrivals, waiting, oriented, inConsultation };
}
