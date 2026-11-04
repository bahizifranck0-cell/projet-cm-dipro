import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError } from "../../src/server/auth/actor";
import * as hosp from "../../src/server/services/hospitalization";
import * as patients from "../../src/server/services/patients";
import { financialClearance } from "../../src/server/services/clearance";
import { listNotifications } from "../../src/server/services/notifications";
import { actorWithRole, freshSeed } from "../helpers";

type A = Awaited<ReturnType<typeof actorWithRole>>;
let resp: A, doc: A, nurse: A, secr: A, dg: A;
let room = "", b1 = "", b2 = "";
before(async () => {
  await freshSeed();
  [resp, doc, nurse, secr, dg] = await Promise.all([actorWithRole("RESP_URGENCES_HOSPITALISATION"), actorWithRole("MEDECIN"), actorWithRole("INFIRMIER"), actorWithRole("SECRETAIRE"), actorWithRole("DIRECTEUR_GENERAL")]);
});
after(() => db.$disconnect());
const newPatient = async (n: string) => (await patients.createPatient(secr.actor, { lastName: n, firstName: "Test", sex: "F" }, { confirmedNotDuplicate: true })).patient!;

test("chambres et lits configurés par le service (aucun créé d'office)", async () => {
  assert.equal(await db.room.count({ where: { code: "M1" } }), 0, "aucune chambre créée d'office");
  await assert.rejects(hosp.createRoom(nurse.actor, { code: "A1", name: "A", category: "X" }), ForbiddenError);
  room = (await hosp.createRoom(resp.actor, { code: "m1", name: "Maternité 1", category: "Maternité" })).id;
  await assert.rejects(hosp.createRoom(resp.actor, { code: "M1", name: "B", category: "X" }), /existe déjà/);
  b1 = (await hosp.addBed(resp.actor, room, "l1")).id;
  b2 = (await hosp.addBed(resp.actor, room, "L2")).id;
  await assert.rejects(hosp.addBed(resp.actor, room, "L1"), /existe déjà/);
});

test("admission par un médecin : passage créé, lit occupé, service notifié ; double admission refusée", async () => {
  const p = await newPatient("Kavugho");
  const a = await hosp.admit(doc.actor, { patientId: p.id, type: "MATERNITY", reason: "Travail", bedId: b1 });
  assert.equal((await db.visit.findUniqueOrThrow({ where: { id: a.visitId! } })).status, "ADMITTED");
  assert.equal((await db.bed.findUniqueOrThrow({ where: { id: b1 } })).status, "OCCUPIED");
  assert.ok((await listNotifications(resp.actor)).some((n) => n.entityId === a.id && n.type === "ADMISSION"));
  assert.ok(!(await listNotifications(doc.actor)).some((n) => n.entityId === a.id), "l'auteur n'est pas notifié de sa propre action");
  await assert.rejects(hosp.admit(doc.actor, { patientId: p.id, type: "HOSPITALIZATION" }), /déjà admis/);
  const p2 = await newPatient("Masika");
  await assert.rejects(hosp.admit(doc.actor, { patientId: p2.id, type: "EMERGENCY", bedId: b1 }), /pas disponible/);
  assert.equal(await db.admission.count({ where: { patientId: p2.id } }), 0, "transaction annulée : aucune admission partielle");
});

test("transfert de lit : historique conservé, disponibilité mise à jour", async () => {
  const a = await db.admission.findFirstOrThrow({ where: { status: "ACTIVE" } });
  await hosp.assignBed(resp.actor, a.id, b2);
  assert.equal((await db.bed.findUniqueOrThrow({ where: { id: b1 } })).status, "AVAILABLE");
  assert.equal((await db.bed.findUniqueOrThrow({ where: { id: b2 } })).status, "OCCUPIED");
  const moves = await db.bedAssignment.findMany({ where: { admissionId: a.id }, orderBy: { startAt: "asc" } });
  assert.equal(moves.length, 2); assert.ok(moves[0].endAt); assert.equal(moves[1].endAt, null);
  const s = await hosp.hospitalStats();
  assert.equal(s.occupied, 1); assert.equal(s.available, 1);
});

test("maternité : formulaire configurable, accouchement, nouveau-né avec dossier propre", async () => {
  const a = await db.admission.findFirstOrThrow({ where: { status: "ACTIVE" } });
  await db.formTemplate.create({ data: { context: "MATERNITY_DELIVERY", name: "Accouchement", fields: [{ key: "mode", label: "Mode d'accouchement", type: "select", options: ["Voie basse", "Autre"], required: true }] } });
  await assert.rejects(hosp.addMaternityRecord(resp.actor, a.id, "MATERNITY_DELIVERY", {}), /Mode d'accouchement/);
  const rec = await hosp.addMaternityRecord(resp.actor, a.id, "MATERNITY_DELIVERY", { mode: "Voie basse" }, "RAS");
  assert.deepEqual(rec.data, { mode: "Voie basse", notes: "RAS" });
  // Créer un dossier patient demande la permission « Patients — Créer » (non incluse par défaut pour ce service)
  await assert.rejects(hosp.registerNewborn(resp.actor, rec.id, { firstName: "Bébé", createRecord: true }), ForbiddenError);
  const noRecord = await hosp.registerNewborn(resp.actor, rec.id, { firstName: "Jumeau", sex: "F" });
  assert.equal(noRecord.childPatientId, null);
  const admin = await actorWithRole("SUPER_ADMIN", { superAdmin: true });
  const n = await hosp.registerNewborn(admin.actor, rec.id, { firstName: "Bébé", sex: "M", createRecord: true });
  const child = await db.patient.findUniqueOrThrow({ where: { id: n.childPatientId! } });
  assert.equal(child.lastName, "Kavugho"); assert.ok(child.patientNumber);
  await hosp.addNote(nurse.actor, a.id, "Soins", "Pansement refait");
  await assert.rejects(hosp.addNote(nurse.actor, a.id, "Soins", "  "), /vide/);
});

test("sortie bloquée si impayé ; possible après crédit approuvé par le DG ; frais de séjour au tarif", async () => {
  const a = await db.admission.findFirstOrThrow({ where: { status: "ACTIVE" } });
  await db.tariffItem.create({ data: { code: `HOSP-${Date.now()}`, name: "Journée d'hospitalisation", category: "HOSPITALIZATION", price: "20.00", currency: "USD", unit: "jour" } });
  await assert.rejects(hosp.discharge(nurse.actor, a.id), ForbiddenError);
  await assert.rejects(hosp.discharge(resp.actor, a.id), /Sortie bloquée : des prestations ne sont pas encore facturées/);
  const stay = await db.charge.findFirstOrThrow({ where: { source: "HOSPITALIZATION", sourceId: a.id } });
  assert.equal(stay.quantity.toString(), "1"); assert.equal(stay.total.toString(), "20");
  await hosp.updateStayCharge(resp.actor, a.id);
  assert.equal(await db.charge.count({ where: { source: "HOSPITALIZATION", sourceId: a.id } }), 1, "jamais dupliqué");
  // Facture émise mais non payée (la facturation complète est testée en phase 10)
  const charges = await db.charge.findMany({ where: { patientId: a.patientId, status: "ACTIVE", invoiceId: null } });
  const inv = await db.invoice.create({ data: { number: `T-${Date.now()}`, type: "PATIENT", patientId: a.patientId, currency: "USD", subtotal: "20", total: "20", status: "ISSUED", charges: { connect: charges.map((c) => ({ id: c.id })) } } });
  assert.equal((await financialClearance(a.patientId)).balance, "20");
  await assert.rejects(hosp.discharge(resp.actor, a.id), /il reste 20 à régler/);
  await db.creditRequest.create({ data: { invoiceId: inv.id, patientId: a.patientId, amount: "20", currency: "USD", reason: "Indigent", requestedById: resp.user.id, status: "APPROVED", decidedById: dg.user.id, decidedAt: new Date() } });
  await hosp.discharge(resp.actor, a.id, "Bon état général");
  const done = await db.admission.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(done.status, "DISCHARGED"); assert.ok(done.dischargeCreditRequestId);
  assert.equal((await db.bed.findUniqueOrThrow({ where: { id: b2 } })).status, "AVAILABLE");
  assert.equal((await db.visit.findUniqueOrThrow({ where: { id: done.visitId! } })).status, "CLOSED");
});
