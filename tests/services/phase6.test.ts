import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError, ValidationError } from "../../src/server/auth/actor";
import * as spec from "../../src/server/services/specialties";
import * as cons from "../../src/server/services/consultations";
import * as appts from "../../src/server/services/appointments";
import * as patients from "../../src/server/services/patients";
import * as reception from "../../src/server/services/reception";
import { listNotifications } from "../../src/server/services/notifications";
import { readDocumentForStaff, readDocumentForPatient } from "../../src/server/services/documents";
import { actorWithRole, freshSeed } from "../helpers";

type A = Awaited<ReturnType<typeof actorWithRole>>;
let admin: A, gp: A, dentist: A, psy: A, nurse: A, recep: A, secr: A;
const S: Record<string, string> = {};
let patientId = "";

before(async () => {
  await freshSeed();
  [admin, gp, dentist, psy, nurse, recep, secr] = await Promise.all([
    actorWithRole("SUPER_ADMIN", { superAdmin: true }), actorWithRole("MEDECIN"), actorWithRole("MEDECIN"), actorWithRole("MEDECIN"),
    actorWithRole("INFIRMIER"), actorWithRole("RECEPTIONNISTE"), actorWithRole("SECRETAIRE"),
  ]);
  patientId = (await patients.createPatient(secr.actor, { lastName: "Kambale", firstName: "Paul" }, { confirmedNotDuplicate: true })).patient!.id;
});
after(() => db.$disconnect());

test("spécialités dynamiques : création, formulaire versionné, affectation", async () => {
  await assert.rejects(spec.createSpecialty(gp.actor, { name: "X" }), ForbiddenError);
  for (const [k, name, confidential] of [["gen", "Médecine générale", false], ["dent", "Dentisterie", false], ["psy", "Psychologie", true]] as const)
    S[k] = (await spec.createSpecialty(admin.actor, { name, confidential })).id;
  await assert.rejects(spec.createSpecialty(admin.actor, { name: "médecine générale" }), /existe déjà/);
  await assert.rejects(spec.saveForm(admin.actor, S.dent, "CONSULTATION", [{ key: "dent", label: "Dent", type: "select", options: ["1"] }], false), /deux options/);
  const v1 = await spec.saveForm(admin.actor, S.dent, "CONSULTATION", [{ key: "dent", label: "Dent concernée", type: "text", required: true }], false);
  const v2 = await spec.saveForm(admin.actor, S.dent, "CONSULTATION", [
    { key: "dent", label: "Dent concernée", type: "text", required: true },
    { key: "douleur", label: "Douleur (0-10)", type: "number" },
    { key: "soin", label: "Soin", type: "select", options: ["Détartrage", "Extraction", "Obturation"] },
  ], true);
  assert.equal(v2.version, 2);
  assert.equal((await db.formTemplate.findUniqueOrThrow({ where: { id: v1.id } })).active, false);
  for (const [a, k] of [[gp, "gen"], [dentist, "dent"], [psy, "psy"]] as const) await spec.assignDoctor(admin.actor, S[k], a.emp.id);
  await assert.rejects(spec.assignDoctor(admin.actor, S.gen, gp.emp.id), /déjà affecté/);
});

test("consultation : seul un médecin affecté démarre, formulaire de sa spécialité, auteur seul modifie", async () => {
  const v = await reception.registerArrival(recep.actor, patientId, { doctorId: dentist.emp.id, reason: "Douleur dentaire" });
  assert.ok((await cons.doctorQueue(dentist.actor)).some((x) => x.id === v.id), "dans la file du dentiste");
  assert.ok(!(await cons.doctorQueue(gp.actor)).some((x) => x.id === v.id), "pas dans celle du généraliste");
  await assert.rejects(cons.startConsultation(dentist.actor, v.id, S.gen), /pas affecté/);
  await assert.rejects(cons.startConsultation(nurse.actor, v.id, S.dent), ForbiddenError);
  const c = await cons.startConsultation(dentist.actor, v.id, S.dent);
  assert.equal((await db.visit.findUniqueOrThrow({ where: { id: v.id } })).status, "IN_CONSULTATION");
  assert.equal((await db.formTemplate.findUniqueOrThrow({ where: { id: c.formTemplateId! } })).version, 2);
  await assert.rejects(cons.saveConsultation(gp.actor, c.id, {}), /médecin auteur/);
  await assert.rejects(cons.saveConsultation(dentist.actor, c.id, { form: { douleur: "beaucoup" } }), /nombre/);
  await cons.saveConsultation(dentist.actor, c.id, { observations: "Carie profonde", form: { douleur: "7", soin: "Obturation" } });
  await assert.rejects(cons.signConsultation(dentist.actor, c.id, { closeVisit: true }), /Dent concernée/);
  await cons.saveConsultation(dentist.actor, c.id, { observations: "Carie profonde", diagnosis: "Carie 36", form: { dent: "36", douleur: "7", soin: "Obturation" }, patientVisible: true });
  await cons.addPrescription(dentist.actor, c.id, [{ medication: "Paracétamol 500 mg", dosage: "1 comprimé", frequency: "3 fois par jour", duration: "5 jours" }]);
  await assert.rejects(cons.addPrescription(dentist.actor, c.id, []), /au moins un/);
  const r = await cons.signConsultation(dentist.actor, c.id, { closeVisit: true });
  assert.equal(r.charged, false, "aucun tarif configuré : rien n'est inventé");
  const signed = await db.consultation.findUniqueOrThrow({ where: { id: c.id } });
  assert.equal(signed.status, "SIGNED");
  assert.deepEqual(signed.formData, { dent: "36", douleur: 7, soin: "Obturation" });
  assert.equal((await db.visit.findUniqueOrThrow({ where: { id: v.id } })).status, "CLOSED");
  await assert.rejects(cons.saveConsultation(dentist.actor, c.id, {}), /signée/);
  // Ordonnance PDF rattachée au dossier, visible par le patient, lisible par le personnel autorisé
  const doc = await db.document.findFirstOrThrow({ where: { patientId, type: "PRESCRIPTION" } });
  assert.ok(doc.visibleToPatient);
  const staff = await readDocumentForStaff(gp.actor, doc.id);
  assert.equal(staff!.data.subarray(0, 5).toString(), "%PDF-");
  await assert.rejects(readDocumentForStaff(recep.actor, doc.id), ForbiddenError);
  assert.ok(await readDocumentForPatient(patientId, doc.id));
  assert.equal(await readDocumentForPatient("autre-patient", doc.id), null, "jamais le document d'un autre patient");
});

test("tarif configuré : la consultation est ajoutée au compte du patient au prix du catalogue", async () => {
  await db.tariffItem.create({ data: { code: `CONS-DENT-${Date.now()}`, name: "Consultation dentaire", category: "CONSULTATION", specialtyId: S.dent, price: "10.00", currency: "USD" } });
  await db.tariffItem.create({ data: { code: `CONS-GEN-${Date.now()}`, name: "Consultation générale", category: "CONSULTATION", price: "5.00", currency: "USD" } });
  const v = await reception.registerArrival(recep.actor, patientId, { doctorId: dentist.emp.id });
  const c = await cons.startConsultation(dentist.actor, v.id, S.dent);
  await cons.saveConsultation(dentist.actor, c.id, { diagnosis: "Contrôle", form: { dent: "36" } });
  assert.equal((await cons.signConsultation(dentist.actor, c.id, { closeVisit: true })).charged, true);
  const ch = await db.charge.findFirstOrThrow({ where: { sourceId: c.id } });
  assert.equal(ch.unitPrice.toString(), "10", "le tarif propre à la spécialité est prioritaire");
  assert.equal(ch.patientId, patientId);
});

test("orientation vers un confrère : passage réorienté et confrère notifié", async () => {
  const v = await reception.registerArrival(recep.actor, patientId, { doctorId: gp.emp.id });
  const c = await cons.startConsultation(gp.actor, v.id, S.gen);
  await cons.saveConsultation(gp.actor, c.id, { diagnosis: "Anxiété à évaluer" });
  await assert.rejects(cons.referPatient(gp.actor, c.id, {}), /Choisissez/);
  await cons.referPatient(gp.actor, c.id, { toDoctorId: psy.emp.id, toSpecialtyId: S.psy, reason: "Avis psychologique" });
  await cons.signConsultation(gp.actor, c.id, { closeVisit: true });
  const visit = await db.visit.findUniqueOrThrow({ where: { id: v.id } });
  assert.equal(visit.status, "ORIENTED"); assert.equal(visit.orientedToDoctorId, psy.emp.id);
  assert.ok((await listNotifications(psy.actor)).some((n) => n.type === "REFERRAL" && n.entityId === v.id));
  assert.ok((await cons.doctorQueue(psy.actor)).some((x) => x.id === v.id));
});

test("confidentialité : consultation de psychologie invisible aux autres spécialités", async () => {
  const v = await db.visit.findFirstOrThrow({ where: { patientId, orientedToDoctorId: psy.emp.id, status: "ORIENTED" } });
  const c = await cons.startConsultation(psy.actor, v.id, S.psy);
  await cons.saveConsultation(psy.actor, c.id, { observations: "Notes d'entretien confidentielles", diagnosis: "Évaluation" });
  await cons.signConsultation(psy.actor, c.id, { closeVisit: true });
  await assert.rejects(cons.getConsultation(gp.actor, c.id), /confidentielle/);
  assert.ok(await cons.getConsultation(psy.actor, c.id));
  const seenByGp = (await cons.patientConsultations(gp.actor, patientId)).find((x) => x.id === c.id)!;
  assert.equal(seenByGp.observations, null, "contenu masqué, existence visible");
  assert.equal((await cons.patientConsultations(recep.actor, patientId)).length, 0, "la réception ne voit pas les consultations");
});

test("rendez-vous : création + PDF, conflit d'horaire, report lié, annulation motivée, arrivée honorée", async () => {
  const at = new Date(Date.now() + 3 * 86400e3); at.setUTCMinutes(0, 0, 0);
  const local = new Date(at.getTime() + 2 * 3600e3).toISOString().slice(0, 16);
  await assert.rejects(appts.createAppointment(recep.actor, { patientId, doctorId: dentist.emp.id, scheduledAt: local, reason: "X" }), ForbiddenError);
  await assert.rejects(appts.createAppointment(dentist.actor, { patientId, doctorId: dentist.emp.id, scheduledAt: "2020-01-01T10:00", reason: "X" }), /futur/);
  const a = await appts.createAppointment(dentist.actor, { patientId, doctorId: dentist.emp.id, specialtyId: S.dent, scheduledAt: local, reason: "Contrôle après obturation" });
  assert.equal(a.scheduledAt.toISOString(), at.toISOString(), "heure de Goma convertie correctement");
  assert.ok(await db.document.findFirst({ where: { entityType: "Appointment", entityId: a.id, type: "APPOINTMENT", visibleToPatient: true } }));
  await assert.rejects(appts.createAppointment(dentist.actor, { patientId, doctorId: dentist.emp.id, scheduledAt: local, reason: "Y" }), /déjà un rendez-vous/);
  const later = new Date(at.getTime() + 2 * 3600e3 + 86400e3).toISOString().slice(0, 16);
  const b = await appts.rescheduleAppointment(dentist.actor, a.id, { scheduledAt: later, reason: "Indisponibilité" });
  assert.equal(b.rescheduledFromId, a.id);
  assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: a.id } })).status, "RESCHEDULED");
  await assert.rejects(appts.cancelAppointment(dentist.actor, a.id, "x"), /prévu/);
  await assert.rejects(appts.cancelAppointment(dentist.actor, b.id, ""), /motif/);
  // Arrivée sur rendez-vous : orientation reprise et rendez-vous honoré
  const v = await reception.registerArrival(recep.actor, patientId, { appointmentId: b.id });
  assert.equal(v.orientedToDoctorId, dentist.emp.id);
  const bb = await db.appointment.findUniqueOrThrow({ where: { id: b.id }, include: { events: true } });
  assert.equal(bb.status, "HONORED");
  assert.deepEqual(bb.events.map((e) => e.status).sort(), ["HONORED", "SCHEDULED"]);
  assert.equal((await appts.listAppointments(recep.actor, { patientId })).length, 2);
});
