import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentType } from "@prisma/client";
import { db, type Tx } from "../db";
import { can, ForbiddenError, type Actor } from "../auth/actor";
import { STORAGE_DIR } from "../storage";
import { nextNumber } from "./sequences";
import { audit } from "./audit";

const PREFIX: Record<DocumentType, string> = {
  LAB_RESULT: "LAB", PRESCRIPTION: "ORD", INVOICE: "FAC", RECEIPT: "REC", APPOINTMENT: "RDV",
  PAYSLIP: "PAIE", REPORT: "RAP", MEDICAL: "MED", ADMINISTRATIVE: "ADM", OTHER: "DOC",
};

/** Permission nécessaire au personnel pour voir un type de document. */
export const DOC_PERMISSION: Record<DocumentType, [Parameters<typeof can>[1], "view"]> = {
  LAB_RESULT: ["laboratory", "view"], PRESCRIPTION: ["consultations", "view"], MEDICAL: ["consultations", "view"],
  INVOICE: ["billing", "view"], RECEIPT: ["cash", "view"], APPOINTMENT: ["appointments", "view"],
  PAYSLIP: ["hr", "view"], REPORT: ["reports", "view"], ADMINISTRATIVE: ["documents", "view"], OTHER: ["documents", "view"],
};

export async function documentNumber(type: DocumentType, tx: Tx = db) {
  const y = new Date().getUTCFullYear();
  return `${PREFIX[type]}-${y}-${String(await nextNumber(`DOC-${PREFIX[type]}-${y}`, tx)).padStart(5, "0")}`;
}

/** Enregistre un PDF généré dans le stockage privé et l'indexe dans le module Documents. */
export async function storeDocument(input: {
  type: DocumentType; title: string; pdf: Buffer; number: string; createdById: string;
  patientId?: string | null; employeeId?: string | null; entityType?: string; entityId?: string; visibleToPatient?: boolean;
}, tx: Tx = db) {
  const rel = path.posix.join("documents", input.type.toLowerCase(), `${input.number}-${randomBytes(4).toString("hex")}.pdf`);
  const abs = path.resolve(STORAGE_DIR, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.pdf);
  const prev = input.entityId ? await tx.document.count({ where: { entityType: input.entityType, entityId: input.entityId, type: input.type } }) : 0;
  return tx.document.create({
    data: {
      number: input.number, type: input.type, title: input.title, storagePath: rel, mimeType: "application/pdf",
      sizeBytes: input.pdf.length, sha256: createHash("sha256").update(input.pdf).digest("hex"),
      patientId: input.patientId ?? null, employeeId: input.employeeId ?? null, entityType: input.entityType, entityId: input.entityId,
      version: prev + 1, visibleToPatient: input.visibleToPatient ?? false, createdById: input.createdById,
    },
  });
}

/** Contrôle d'accès à un document : personnel autorisé par type, ou l'employé concerné (bulletin). */
export async function readDocumentForStaff(actor: Actor, id: string) {
  const d = await db.document.findUnique({ where: { id } });
  if (!d) return null;
  const [m, a] = DOC_PERMISSION[d.type];
  const own = d.type === "PAYSLIP" && d.employeeId && d.employeeId === actor.employeeId;
  if (!(can(actor, m, a) || can(actor, "documents", "view") && d.type !== "PAYSLIP" || own)) throw new ForbiddenError();
  await audit(actor, { action: "DOCUMENT_VIEW", module: "documents", entityType: "Document", entityId: d.id });
  return { doc: d, data: await readFile(path.resolve(STORAGE_DIR, d.storagePath)) };
}

export async function readDocumentForPatient(patientId: string, id: string) {
  const d = await db.document.findUnique({ where: { id } });
  if (!d || d.patientId !== patientId || !d.visibleToPatient) return null; // jamais le document d'un autre patient
  return { doc: d, data: await readFile(path.resolve(STORAGE_DIR, d.storagePath)) };
}
