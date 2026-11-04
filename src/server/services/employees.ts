import { z } from "zod";
import { db } from "../db";
import { assertCan, ValidationError, type Actor } from "../auth/actor";
import { savePhoto } from "../storage";
import { audit } from "./audit";
import { nextNumber } from "./sequences";
import { opt, parse, req } from "./validation";

const employeeInput = z.object({
  firstName: req("Le prénom", 60),
  lastName: req("Le nom", 60),
  postName: opt(60),
  sex: z.enum(["F", "M"]).optional().or(z.literal("").transform(() => undefined)),
  phone: opt(30),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.")]).optional().transform((v) => v || undefined),
  address: opt(200),
  position: req("La fonction", 80),
  departmentId: opt(40),
  matricule: opt(30),
});

export async function listEmployees(actor: Actor, q?: string) {
  assertCan(actor, "hr", "view");
  const term = q?.trim();
  return db.employee.findMany({
    where: term ? { OR: [
      { lastName: { contains: term, mode: "insensitive" } },
      { firstName: { contains: term, mode: "insensitive" } },
      { matricule: { contains: term, mode: "insensitive" } },
    ] } : {},
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { department: true, user: { select: { id: true, username: true, status: true } } },
    take: 200,
  });
}

/** Employés pouvant recevoir un compte (aucun compte existant). */
export async function employeesWithoutAccount(actor: Actor) {
  if (!actor.isSuperAdmin) assertCan(actor, "hr", "view");
  return db.employee.findMany({ where: { user: null, status: "ACTIVE" }, orderBy: { lastName: "asc" }, include: { department: true } });
}

export async function createEmployee(actor: Actor, raw: unknown, photo?: Buffer) {
  assertCan(actor, "hr", "create");
  const data = parse(employeeInput, raw);
  if (data.departmentId && !(await db.department.findFirst({ where: { id: data.departmentId, active: true } })))
    throw new ValidationError("Département introuvable ou inactif.", "departmentId");
  if (data.matricule && (await db.employee.findUnique({ where: { matricule: data.matricule } })))
    throw new ValidationError("Ce matricule est déjà utilisé.", "matricule");

  const matricule = data.matricule ?? `EMP-${String(await nextNumber("EMP")).padStart(4, "0")}`;
  const emp = await db.employee.create({ data: { ...data, matricule } });
  if (photo?.length) {
    const photoPath = await savePhoto(`employees/${emp.id}`, photo);
    await db.employee.update({ where: { id: emp.id }, data: { photoPath } });
  }
  await audit(actor, { action: "CREATE", module: "hr", entityType: "Employee", entityId: emp.id, details: { matricule, name: `${data.firstName} ${data.lastName}` } });
  return emp;
}

export async function updateEmployeePhoto(actor: Actor, employeeId: string, photo: Buffer) {
  assertCan(actor, "hr", "update");
  const photoPath = await savePhoto(`employees/${employeeId}`, photo);
  await db.employee.update({ where: { id: employeeId }, data: { photoPath } });
  await audit(actor, { action: "PHOTO_UPDATE", module: "hr", entityType: "Employee", entityId: employeeId });
}
