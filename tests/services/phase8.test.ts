import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/server/db";
import { ForbiddenError } from "../../src/server/auth/actor";
import * as lab from "../../src/server/services/laboratory";
import * as cons from "../../src/server/services/consultations";
import { listNotifications } from "../../src/server/services/notifications";
import { readDocumentForPatient } from "../../src/server/services/documents";
import { actorWithRole, freshSeed } from "../helpers";

type A = Awaited<ReturnType<typeof actorWithRole>>;
let doc: A, other: A, labm: A, nurse: A;
let consultationId = "", patientId = "";
const T: Record<string, string> = {};
before(async () => {
  await freshSeed();
  [doc, other, labm, nurse] = await Promise.all([actorWithRole("MEDECIN"), actorWithRole("MEDECIN"), actorWithRole("RESP_LABORATOIRE"), actorWithRole("INFIRMIER")]);
  const spec = await db.specialty.create({ data: { code: `G8-${Date.now()}`, name: "Générale" } });
  await db.doctorAssignment.create({ data: { employeeId: doc.emp.id, specialtyId: spec.id } });
  patientId = (await db.patient.create({ data: { patientNumber: `P8-${Date.now()}`, lastName: "Mumbere", firstName: "Eric", searchName: "mumbere eric" } })).id;
  const v = await db.visit.create({ data: { patientId, status: "ORIENTED", orientedToDoctorId: doc.emp.id } });
  consultationId = (await cons.startConsultation(doc.actor, v.id, spec.id)).id;
});
after(() => db.$disconnect());

test("catalogue : géré par le laboratoire, codes uniques", async () => {
  await assert.rejects(lab.saveLabTest(nurse.actor, { code: "GE", name: "Goutte épaisse" }), ForbiddenError);
  const tariff = await db.tariffItem.create({ data: { code: `GE-${Date.now()}`, name: "Goutte épaisse", category: "LAB", price: "3.00", currency: "USD" } });
  T.ge = (await lab.saveLabTest(labm.actor, { code: "ge", name: "Goutte épaisse", sampleType: "Sang", tariffItemId: tariff.id })).id;
  T.hb = (await lab.saveLabTest(labm.actor, { code: "HB", name: "Hémoglobine", unit: "g/dL", referenceRange: "valeurs fournies par le laboratoire" })).id;
  await assert.rejects(lab.saveLabTest(labm.actor, { code: "GE", name: "Doublon" }), /existe déjà/);
});

test("demande : seul le médecin de la consultation, labo notifié, analyse facturée au tarif", async () => {
  await assert.rejects(lab.requestLab(other.actor, consultationId, [T.ge]), /Seul le médecin/);
  await assert.rejects(lab.requestLab(doc.actor, consultationId, []), /au moins une/);
  const r = await lab.requestLab(doc.actor, consultationId, [T.ge, T.hb], "Fièvre depuis 3 jours");
  assert.match(r.number, /^LAB-\d{4}-\d{5}$/);
  assert.ok((await listNotifications(labm.actor)).some((n) => n.entityId === r.id && n.type === "LAB_REQUEST"));
  const charges = await db.charge.findMany({ where: { source: "LAB", sourceId: r.id } });
  assert.equal(charges.length, 1, "seule l'analyse avec un tarif est facturée");
  assert.equal(charges[0].total.toString(), "3");
  T.req = r.id;
});

test("prélèvement, saisie, soumission incomplète refusée, validation, PDF, médecin notifié", async () => {
  await assert.rejects(lab.validateResults(labm.actor, T.req), /d'abord être saisis/);
  await lab.recordSample(labm.actor, T.req, "Sang veineux");
  assert.equal((await db.labRequest.findUniqueOrThrow({ where: { id: T.req } })).status, "SAMPLED");
  const items = await db.labRequestItem.findMany({ where: { labRequestId: T.req }, include: { labTest: true } });
  const ge = items.find((i) => i.labTest.code === "GE")!, hb = items.find((i) => i.labTest.code === "HB")!;
  await assert.rejects(lab.enterResults(labm.actor, T.req, { items: [{ id: ge.id, resultValue: "Positif" }], submit: true }), /Résultat manquant : Hémoglobine/);
  await lab.enterResults(labm.actor, T.req, { items: [{ id: ge.id, resultValue: "Positif", flag: "anormal" }], submit: false });
  assert.equal((await db.labRequest.findUniqueOrThrow({ where: { id: T.req } })).status, "IN_PROGRESS");
  await lab.enterResults(labm.actor, T.req, { items: [{ id: hb.id, resultValue: "11.2", flag: "bas" }], conclusion: "Paludisme", submit: true });
  await assert.rejects(lab.validateResults(nurse.actor, T.req), ForbiddenError);
  const d = await lab.validateResults(labm.actor, T.req);
  const r = await db.labRequest.findUniqueOrThrow({ where: { id: T.req } });
  assert.equal(r.status, "VALIDATED"); assert.equal(r.validatedById, labm.user.id);
  assert.ok((await listNotifications(doc.actor)).some((n) => n.type === "LAB_RESULT" && n.entityId === T.req));
  assert.equal(d.patientId, patientId); assert.ok(d.visibleToPatient);
  const f = await readDocumentForPatient(patientId, d.id);
  assert.equal(f!.data.subarray(0, 5).toString(), "%PDF-");
  await assert.rejects(lab.enterResults(labm.actor, T.req, { items: [] }), /clôturée/);
  assert.equal((await lab.patientLabRequests(doc.actor, patientId)).length, 1);
});

test("annulation : motif obligatoire, prestations non facturées annulées", async () => {
  const r = await lab.requestLab(doc.actor, consultationId, [T.ge]);
  await assert.rejects(lab.cancelLabRequest(labm.actor, r.id, ""), /motif/);
  await lab.cancelLabRequest(labm.actor, r.id, "Erreur de prescription");
  assert.equal((await db.charge.findFirstOrThrow({ where: { sourceId: r.id } })).status, "CANCELLED");
});
