import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import { assertCan, ValidationError, type Actor } from "../auth/actor";
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { audit } from "./audit";
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from "./auth";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const HOURS = 4;

// ── Comptes du portail : créés par le secrétariat, séparés des comptes du personnel ──
export async function createPatientAccount(actor: Actor, patientId: string, usernameRaw: string, password: string) {
  assertCan(actor, "patients", "update");
  const username = usernameRaw?.trim().toLowerCase();
  if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) throw new ValidationError("Identifiant : 3 à 40 caractères (lettres, chiffres, . _ -).", "username");
  const problem = passwordProblem(password);
  if (problem) throw new ValidationError(problem, "password");
  if (await db.patientAccount.findUnique({ where: { patientId } })) throw new ValidationError("Ce patient a déjà un compte.");
  if ((await db.patientAccount.findUnique({ where: { username } })) || (await db.user.findUnique({ where: { username } }))) throw new ValidationError("Cet identifiant est déjà pris.", "username");
  const acc = await db.patientAccount.create({ data: { patientId, username, passwordHash: `MUST_CHANGE:${await hashPassword(password)}`, activatedById: actor.userId } });
  await audit(actor, { action: "CREATE", module: "patients", entityType: "PatientAccount", entityId: acc.id, details: { patientId, username } });
  return acc;
}

export async function setPatientAccountStatus(actor: Actor, patientId: string, status: "ACTIVE" | "DISABLED") {
  assertCan(actor, "patients", "update");
  const acc = await db.patientAccount.findUniqueOrThrow({ where: { patientId } });
  await db.patientAccount.update({ where: { id: acc.id }, data: { status } });
  if (status === "DISABLED") await db.session.updateMany({ where: { patientAccountId: acc.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(actor, { action: status === "DISABLED" ? "DEACTIVATE" : "ACTIVATE", module: "patients", entityType: "PatientAccount", entityId: acc.id });
}

export async function resetPatientPassword(actor: Actor, patientId: string, password: string) {
  assertCan(actor, "patients", "update");
  const problem = passwordProblem(password);
  if (problem) throw new ValidationError(problem, "password");
  const acc = await db.patientAccount.findUniqueOrThrow({ where: { patientId } });
  await db.patientAccount.update({ where: { id: acc.id }, data: { passwordHash: `MUST_CHANGE:${await hashPassword(password)}` } });
  await db.session.updateMany({ where: { patientAccountId: acc.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(actor, { action: "PASSWORD_RESET", module: "patients", entityType: "PatientAccount", entityId: acc.id });
}

// ── Connexion du patient ──
export type PortalSession = { accountId: string; patientId: string; mustChangePassword: boolean; sessionId: string };

export async function portalLogin(usernameRaw: string, password: string, ip?: string | null) {
  const username = usernameRaw.trim().toLowerCase();
  if (!username || !password) return { ok: false as const, error: "Saisissez votre identifiant et votre mot de passe." };
  const since = new Date(Date.now() - LOCK_MINUTES * 60e3);
  if ((await db.auditLog.count({ where: { action: "LOGIN_FAILED", module: "portal", entityId: username, at: { gte: since } } })) >= MAX_FAILED_LOGINS)
    return { ok: false as const, error: `Trop de tentatives. Réessayez dans ${LOCK_MINUTES} minutes.` };
  const acc = await db.patientAccount.findUnique({ where: { username } });
  const hash = acc?.passwordHash.replace(/^MUST_CHANGE:/, "");
  const valid = acc && hash ? await verifyPassword(password, hash) : (await dummyVerify(password), false);
  if (!acc || !valid || acc.status !== "ACTIVE") {
    await db.auditLog.create({ data: { action: "LOGIN_FAILED", module: "portal", entityType: "username", entityId: username, ip: ip ?? null } });
    return { ok: false as const, error: acc && valid ? "Ce compte est désactivé. Contactez l'accueil." : "Identifiant ou mot de passe incorrect." };
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + HOURS * 3600e3);
  const s = await db.session.create({ data: { tokenHash: hashToken(token), patientAccountId: acc.id, expiresAt, ip: ip ?? null } });
  await db.patientAccount.update({ where: { id: acc.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({ data: { patientAccountId: acc.id, action: "LOGIN", module: "portal", entityType: "Session", entityId: s.id, ip: ip ?? null } });
  return { ok: true as const, token, expiresAt, mustChangePassword: acc.passwordHash.startsWith("MUST_CHANGE:") };
}

/** Session du portail : jamais utilisable comme session du personnel (et inversement). */
export async function portalSessionFromToken(token?: string): Promise<PortalSession | null> {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { patientAccount: true } });
  if (!s?.patientAccount || s.revokedAt || s.expiresAt < new Date() || s.patientAccount.status !== "ACTIVE") return null;
  return { accountId: s.patientAccount.id, patientId: s.patientAccount.patientId, mustChangePassword: s.patientAccount.passwordHash.startsWith("MUST_CHANGE:"), sessionId: s.id };
}

export async function portalLogout(s: PortalSession) {
  await db.session.update({ where: { id: s.sessionId }, data: { revokedAt: new Date() } });
}

export async function portalChangePassword(s: PortalSession, current: string, next: string, confirm: string) {
  const acc = await db.patientAccount.findUniqueOrThrow({ where: { id: s.accountId } });
  if (!(await verifyPassword(current, acc.passwordHash.replace(/^MUST_CHANGE:/, "")))) throw new ValidationError("Mot de passe actuel incorrect.", "current");
  if (next !== confirm) throw new ValidationError("Les deux nouveaux mots de passe ne correspondent pas.", "confirm");
  const problem = passwordProblem(next);
  if (problem) throw new ValidationError(problem, "next");
  await db.patientAccount.update({ where: { id: acc.id }, data: { passwordHash: await hashPassword(next) } });
  await db.session.updateMany({ where: { patientAccountId: acc.id, revokedAt: null, id: { not: s.sessionId } }, data: { revokedAt: new Date() } });
  await db.auditLog.create({ data: { patientAccountId: acc.id, action: "PASSWORD_CHANGED", module: "portal", entityType: "PatientAccount", entityId: acc.id } });
}

// ── Données visibles par le patient : uniquement les siennes, uniquement ce qui est communicable ──
export async function portalData(patientId: string) {
  const [patient, visits, consultations, labs, appts, admissions, invoices, debts, docs] = await Promise.all([
    db.patient.findUniqueOrThrow({ where: { id: patientId } }),
    db.visit.findMany({ where: { patientId, status: { not: "CANCELLED" } }, orderBy: { arrivedAt: "desc" }, take: 50 }),
    db.consultation.findMany({ where: { patientId, status: "SIGNED", patientVisible: true }, orderBy: { signedAt: "desc" },
      select: { id: true, signedAt: true, diagnosis: true, treatment: true, specialty: { select: { name: true } }, doctor: { select: { firstName: true, lastName: true } }, prescriptions: { include: { items: true } } } }),
    db.labRequest.findMany({ where: { patientId, patientVisible: true, status: { in: ["REQUESTED", "SAMPLED", "IN_PROGRESS", "AWAITING_VALIDATION", "VALIDATED"] } }, orderBy: { requestedAt: "desc" },
      select: { id: true, number: true, status: true, requestedAt: true, validatedAt: true, samples: { select: { sampleType: true, collectedAt: true } },
        items: { select: { id: true, resultValue: true, unit: true, referenceRange: true, flag: true, labTest: { select: { name: true } } } } } }),
    db.appointment.findMany({ where: { patientId }, orderBy: { scheduledAt: "desc" }, include: { doctor: { select: { firstName: true, lastName: true } }, specialty: true } }),
    db.admission.findMany({ where: { patientId }, orderBy: { admittedAt: "desc" }, select: { id: true, type: true, admittedAt: true, dischargedAt: true, status: true, maternityRecords: { select: { id: true, context: true, recordedAt: true } } } }),
    db.invoice.findMany({ where: { patientId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, include: { payments: { orderBy: { receivedAt: "asc" } } } }),
    db.debt.findMany({ where: { patientId }, include: { invoice: true } }),
    db.document.findMany({ where: { patientId, visibleToPatient: true }, orderBy: { createdAt: "desc" } }),
  ]);
  // Les résultats ne sont montrés qu'après validation officielle par le laboratoire
  const labsSafe = labs.map((l) => ({ ...l, items: l.status === "VALIDATED" ? l.items : l.items.map((i) => ({ ...i, resultValue: null, flag: null })) }));
  return { patient, visits, consultations, labs: labsSafe, appts, admissions, invoices, debts, docs };
}
