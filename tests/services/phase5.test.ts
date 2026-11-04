import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError, ValidationError } from "../../src/server/auth/actor";
import * as patients from "../../src/server/services/patients";
import * as reception from "../../src/server/services/reception";
import * as settings from "../../src/server/services/settings";
import { actorWithRole, freshSeed } from "../helpers";

let secr: Awaited<ReturnType<typeof actorWithRole>>, recep: typeof secr, cashier: typeof secr, admin: typeof secr, doctor: typeof secr;
before(async () => {
  await freshSeed();
  [secr, recep, cashier, admin, doctor] = await Promise.all([
    actorWithRole("SECRETAIRE"), actorWithRole("RECEPTIONNISTE"), actorWithRole("CAISSIER"), actorWithRole("SUPER_ADMIN", { superAdmin: true }), actorWithRole("MEDECIN"),
  ]);
});
after(() => db.$disconnect());

const base = { lastName: "Muhindo", postName: "Kasereka", firstName: "Élodie", sex: "F" as const, birthDate: "1990-05-12", phone: "0991 234 567", address: "Goma, Himbi" };

test("création : numéro unique et continu, champs de recherche remplis, audit", async () => {
  const r1 = await patients.createPatient(secr.actor, base);
  assert.ok(r1.created);
  const p = r1.patient!;
  assert.match(p.patientNumber, new RegExp(`^P-${new Date().getUTCFullYear()}-\\d{5}$`));
  assert.equal(p.searchName, "muhindo kasereka elodie");
  assert.equal(p.phoneDigits, "991234567");
  assert.ok(await db.auditLog.findFirst({ where: { entityId: p.id, action: "CREATE", userId: secr.user.id } }));
  const r2 = await patients.createPatient(secr.actor, { lastName: "Bahati", firstName: "Jean", phone: "0811111111" });
  const n1 = Number(p.patientNumber.split("-").pop()), n2 = Number(r2.patient!.patientNumber.split("-").pop());
  assert.equal(n2, n1 + 1);
});

test("doublons : même téléphone sous un autre format, même nom sans accents ou dans un autre ordre", async () => {
  const byPhone = await patients.createPatient(secr.actor, { lastName: "Autre", firstName: "Nom", phone: "+243 991-234-567" });
  assert.equal(byPhone.created, false);
  assert.deepEqual(byPhone.duplicates![0].reasons, ["même téléphone"]);
  const byName = await patients.createPatient(secr.actor, { lastName: "MUHINDO", firstName: "elodie", postName: "kasereka" });
  assert.equal(byName.created, false);
  assert.ok(byName.duplicates![0].reasons.includes("même nom complet"));
  const reordered = await patients.findPossibleDuplicates(secr.actor, { lastName: "Elodie", firstName: "Muhindo" });
  assert.equal(reordered.length, 1);
  const none = await patients.findPossibleDuplicates(secr.actor, { lastName: "Kambale", firstName: "Paul", phone: "0970000000" });
  assert.equal(none.length, 0);
  // Homonyme réel : création possible après confirmation explicite, tracée dans l'audit
  const forced = await patients.createPatient(secr.actor, { lastName: "Muhindo", firstName: "Élodie", birthDate: "2015-01-01" }, { confirmedNotDuplicate: true });
  assert.ok(forced.created);
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: forced.patient!.id } });
  assert.equal((log.details as { duplicatesOverridden: string[] }).duplicatesOverridden.length, 1);
});

test("recherche : numéro, téléphone partiel, nom sans accents dans le désordre", async () => {
  const p = (await db.patient.findFirstOrThrow({ where: { searchName: "muhindo kasereka elodie" } }));
  assert.equal((await patients.searchPatients(recep.actor, p.patientNumber.toLowerCase()))[0].id, p.id);
  assert.ok((await patients.searchPatients(recep.actor, "234 567")).some((x) => x.id === p.id));
  assert.ok((await patients.searchPatients(recep.actor, "elodie MUHINDO")).some((x) => x.id === p.id));
  assert.equal((await patients.searchPatients(recep.actor, "zzzz inexistant")).length, 0);
});

test("validation : champs obligatoires, date future, téléphone invalide", async () => {
  await assert.rejects(patients.createPatient(secr.actor, { lastName: "", firstName: "A" }), /Le nom est obligatoire/);
  await assert.rejects(patients.createPatient(secr.actor, { lastName: "A", firstName: "B", birthDate: "2999-01-01" }), /futur/);
  await assert.rejects(patients.createPatient(secr.actor, { lastName: "A", firstName: "B", phone: "abc" }), /téléphone invalide/);
});

test("modification : champs vidés effacés, recherche mise à jour, différences auditées", async () => {
  const p = (await patients.createPatient(secr.actor, { lastName: "Kavira", firstName: "Anne", phone: "0822222222", address: "Katindo" }, { confirmedNotDuplicate: true })).patient!;
  const u = await patients.updatePatient(secr.actor, p.id, { lastName: "Kavira", firstName: "Annette", phone: "" });
  assert.equal(u.phone, null); assert.equal(u.phoneDigits, null); assert.equal(u.address, null); assert.equal(u.searchName, "kavira annette");
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: p.id, action: "UPDATE" } });
  assert.deepEqual(Object.keys(log.details as object).sort(), ["address", "firstName", "phone"]);
});

test("permissions : réceptionniste ne crée pas de dossier, caissier n'enregistre pas d'arrivée", async () => {
  await assert.rejects(patients.createPatient(recep.actor, { lastName: "X", firstName: "Y" }), ForbiddenError);
  const p = await db.patient.findFirstOrThrow();
  await assert.rejects(reception.registerArrival(cashier.actor, p.id, {}), ForbiddenError);
  await assert.rejects(patients.updatePatient(recep.actor, p.id, { lastName: "X", firstName: "Y" }), ForbiddenError);
  await assert.rejects(reception.listQueue(cashier.actor), ForbiddenError);
});

test("accueil : arrivée, orientation, un seul passage ouvert, annulation motivée", async () => {
  const p = (await patients.createPatient(secr.actor, { lastName: "Paluku", firstName: "Joseph" }, { confirmedNotDuplicate: true })).patient!;
  const dep = await db.department.create({ data: { code: `MED-${Date.now()}`, name: `Médecine ${Date.now()}` } });
  const v = await reception.registerArrival(recep.actor, p.id, { reason: "Fièvre", priority: "true" });
  assert.equal(v.status, "WAITING"); assert.equal(v.priority, true);
  await assert.rejects(reception.registerArrival(recep.actor, p.id, {}), /déjà un passage en cours/);
  // Sans passer par le service, la base refuse aussi un second passage ouvert
  await assert.rejects(db.visit.create({ data: { patientId: p.id } }), /Unique constraint/);

  await assert.rejects(reception.orientVisit(recep.actor, v.id, {}), /service ou un médecin/);
  await assert.rejects(reception.orientVisit(recep.actor, v.id, { doctorId: secr.emp.id }), /pas disponible/); // pas médecin
  await reception.orientVisit(recep.actor, v.id, { departmentId: dep.id, doctorId: doctor.emp.id });
  const q = await reception.listQueue(doctor.actor); // le médecin voit la file
  const inQueue = q.find((x) => x.id === v.id)!;
  assert.equal(inQueue.status, "ORIENTED");
  assert.equal(inQueue.orientedToDoctor?.lastName, doctor.emp.lastName);
  assert.equal(q[0].priority, true, "les urgences signalées passent en tête");

  await assert.rejects(reception.cancelVisit(recep.actor, v.id, " "), /motif/);
  await reception.cancelVisit(recep.actor, v.id, "Patient reparti");
  assert.ok(!(await reception.listQueue(recep.actor)).some((x) => x.id === v.id));
  assert.ok((await reception.listQueue(recep.actor, { status: "all" })).some((x) => x.id === v.id && x.status === "CANCELLED"));
  await reception.registerArrival(recep.actor, p.id, { departmentId: dep.id }); // nouveau passage possible
  const actions = (await db.auditLog.findMany({ where: { module: "reception", details: { path: ["patientId"], equals: p.id } } })).map((a) => a.action);
  assert.ok(actions.includes("ARRIVAL"));
});

test("dossier central : historique des passages rattaché au patient", async () => {
  const p = await db.patient.findFirstOrThrow({ where: { firstName: "Joseph" } });
  const rec = await patients.getPatientRecord(recep.actor, p.id);
  assert.equal(rec!.patient.visits.length, 2);
  assert.equal(rec!.patient.visits[1].cancelReason, "Patient reparti");
});

test("paramètres : format du numéro configurable par une personne autorisée", async () => {
  await assert.rejects(settings.setSetting(secr.actor, "patients.numberPrefix", "CMD"), ForbiddenError);
  await assert.rejects(settings.setSetting(admin.actor, "patients.numberPrefix", "cmd pro"), ValidationError);
  await settings.setSetting(admin.actor, "patients.numberPrefix", "CMD");
  await settings.setSetting(admin.actor, "patients.numberWithYear", false);
  const p = (await patients.createPatient(secr.actor, { lastName: "Format", firstName: "Test" }, { confirmedNotDuplicate: true })).patient!;
  assert.match(p.patientNumber, /^CMD-\d{5}$/);
  await settings.setSetting(admin.actor, "patients.numberPrefix", "P");
  await settings.setSetting(admin.actor, "patients.numberWithYear", true);
});

test("âge calculé à partir de la date de naissance", () => {
  assert.equal(patients.ageFrom(new Date("1990-05-12T00:00:00Z"), new Date("2026-05-11T00:00:00Z")), 35);
  assert.equal(patients.ageFrom(new Date("1990-05-12T00:00:00Z"), new Date("2026-05-12T00:00:00Z")), 36);
});
