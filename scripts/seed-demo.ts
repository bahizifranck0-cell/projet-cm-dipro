// Données de DÉMONSTRATION (fictives) pour l'instance de démo uniquement.
// Refuse de s'exécuter si la base ne contient pas « demo » dans son nom ou si CMDPRO_DEMO≠1.
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { seed } from "./seed";
import { DEMO_PASSWORD } from "../src/lib/demo";
import { actorFromToken } from "../src/server/services/sessions";
import { login } from "../src/server/services/auth";
import * as spec from "../src/server/services/specialties";
import * as patients from "../src/server/services/patients";
import * as reception from "../src/server/services/reception";
import * as cons from "../src/server/services/consultations";
import * as lab from "../src/server/services/laboratory";
import * as ph from "../src/server/services/pharmacy";
import * as billing from "../src/server/services/billing";
import * as hosp from "../src/server/services/hospitalization";
import * as appts from "../src/server/services/appointments";

async function main() {
  const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if ((!dbName.includes("demo") && process.env.CMDPRO_DEMO_INSTANCE !== "1") || process.env.CMDPRO_DEMO !== "1") throw new Error(`Refus : base « ${dbName} ». La démo exige une base dont le nom contient « demo » et CMDPRO_DEMO=1.`);
  if (await db.user.count({ where: { username: "demo.admin" } })) { console.log("Démo déjà initialisée."); return; }
  await seed(() => {});
  const pw = await hashPassword(DEMO_PASSWORD);
  const deps = Object.fromEntries(await Promise.all(["Médecine générale", "Dentisterie", "Urgences et hospitalisation", "Laboratoire", "Pharmacie", "Administration"].map(async (n) =>
    [n, await db.department.create({ data: { code: n.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 12), name: `${n} (démo)` } })] as const)));
  const people: [string, string, string, string, string, string | null][] = [
    ["demo.admin", "SUPER_ADMIN", "Aline", "Administratrice", "Super Administratrice", "Administration"], ["demo.finance", "FINANCE", "Benoît", "Kambale", "Comptable", "Administration"],
    ["demo.dg", "DIRECTEUR_GENERAL", "Jean", "Directeur", "Directeur général", "Administration"], ["demo.medecin", "MEDECIN", "Moïse", "Paluku", "Médecin", "Médecine générale"],
    ["demo.dentiste", "MEDECIN", "Esther", "Kahindo", "Dentiste", "Dentisterie"], ["demo.secretaire", "SECRETAIRE", "Grâce", "Masika", "Secrétaire", "Administration"],
    ["demo.accueil", "RECEPTIONNISTE", "Amani", "Bahati", "Réceptionniste", "Administration"], ["demo.caisse", "CAISSIER", "Imani", "Furaha", "Caissière", "Administration"],
    ["demo.labo", "RESP_LABORATOIRE", "Neema", "Sifa", "Responsable laboratoire", "Laboratoire"], ["demo.pharmacie", "RESP_PHARMACIE", "Zawadi", "Mumbere", "Pharmacien", "Pharmacie"],
    ["demo.hospit", "RESP_URGENCES_HOSPITALISATION", "Sifa", "Kavira", "Responsable hospitalisation", "Urgences et hospitalisation"], ["demo.infirmier", "INFIRMIER", "Paul", "Kasereka", "Infirmier", "Urgences et hospitalisation"],
    ["demo.rh", "ADMINISTRATION", "Rose", "Vahamwiti", "Chargée RH", "Administration"],
  ];
  const emp: Record<string, string> = {};
  for (const [u, role, f, l, pos, dep] of people) {
    const r = await db.role.findUniqueOrThrow({ where: { code: role } });
    const e = await db.employee.create({ data: { matricule: `DEMO-${u.split(".")[1].toUpperCase()}`, firstName: f, lastName: `${l} (fictif)`, position: pos, departmentId: dep ? deps[dep].id : null } });
    emp[u] = e.id;
    await db.user.create({ data: { username: u, passwordHash: pw, roleId: r.id, employeeId: e.id, departmentId: e.departmentId, isSuperAdmin: role === "SUPER_ADMIN", mustChangePassword: false } });
  }
  const A = async (u: string) => { const r = await login(u, DEMO_PASSWORD); if (!r.ok) throw new Error(r.error); return (await actorFromToken(r.token))!; };
  const admin = await A("demo.admin"), fin = await A("demo.finance"), doc = await A("demo.medecin"), dent = await A("demo.dentiste"), secr = await A("demo.secretaire"), recep = await A("demo.accueil"), cash = await A("demo.caisse"), labm = await A("demo.labo"), pharm = await A("demo.pharmacie"), hp = await A("demo.hospit");

  const gen = await spec.createSpecialty(admin, { name: "Médecine générale", departmentIds: [deps["Médecine générale"].id] });
  const dentS = await spec.createSpecialty(admin, { name: "Dentisterie", departmentIds: [deps["Dentisterie"].id] });
  await spec.createSpecialty(admin, { name: "Psychologie", confidential: true });
  await spec.saveForm(admin, dentS.id, "CONSULTATION", [{ key: "dent", label: "Dent concernée", type: "text", required: true }, { key: "soin", label: "Soin réalisé", type: "select", options: ["Détartrage", "Extraction", "Obturation"] }], false);
  await spec.assignDoctor(admin, gen.id, emp["demo.medecin"]); await spec.assignDoctor(admin, dentS.id, emp["demo.dentiste"]);
  for (const [code, name, category, price] of [["CONS-GEN", "Consultation générale (démo)", "CONSULTATION", "5"], ["CONS-DENT", "Consultation dentaire (démo)", "CONSULTATION", "8"], ["HOSP-JOUR", "Journée d'hospitalisation (démo)", "HOSPITALIZATION", "15"], ["LAB-GE", "Goutte épaisse (démo)", "LAB", "3"]] as const)
    await billing.saveTariff(admin, { code, name, category, price, currency: "USD", specialtyId: code === "CONS-DENT" ? dentS.id : code === "CONS-GEN" ? gen.id : undefined });
  await billing.setRate(fin, "2800");
  const ge = await lab.saveLabTest(labm, { code: "GE", name: "Goutte épaisse (démo)", category: "Parasitologie", sampleType: "Sang", tariffItemId: (await db.tariffItem.findUniqueOrThrow({ where: { code: "LAB-GE" } })).id });
  const room = await hosp.createRoom(hp, { code: "D1", name: "Salle commune (démo)", category: "Commune" });
  for (const b of ["1", "2", "3"]) await hosp.addBed(hp, room.id, b);
  for (const [n, p, min, q] of [["Paracétamol 500 mg — boîte (démo)", "2.00", 5, 40], ["Seringue 5 ml (démo)", "0.50", 20, 25], ["Amoxicilline 500 mg — boîte (démo)", "4.50", 5, 6]] as const) {
    const prod = await ph.createProduct(pharm, { name: n, price: p, currency: "USD", minStockLevel: min });
    await ph.stockEntry(pharm, prod.id, q, "Stock initial (démo)");
  }
  const mk = async (l: string, f: string, sex: "F" | "M", birth: string, phone: string) => (await patients.createPatient(secr, { lastName: `${l} (fictif)`, firstName: f, sex, birthDate: birth, phone, address: "Goma (adresse fictive)" }, { confirmedNotDuplicate: true })).patient!;
  const p1 = await mk("Muhindo", "Élodie", "F", "1990-05-12", "0990000001"), p2 = await mk("Bahati", "Jean", "M", "1984-02-03", "0990000002"), p3 = await mk("Kavugho", "Anne", "F", "1998-11-20", "0990000003");
  // Patient 1 : consultation, analyse validée, facture payée
  let v = await reception.registerArrival(recep, p1.id, { doctorId: emp["demo.medecin"], reason: "Fièvre (démo)" });
  let c = await cons.startConsultation(doc, v.id, gen.id);
  await cons.saveConsultation(doc, c.id, { observations: "Observation fictive", diagnosis: "Paludisme simple (démo)", treatment: "Traitement fictif", patientVisible: true });
  await cons.addPrescription(doc, c.id, [{ medication: "Paracétamol 500 mg", dosage: "1 comprimé", frequency: "3 fois par jour", duration: "5 jours" }]);
  const lr = await lab.requestLab(doc, c.id, [ge.id], "Fièvre (démo)");
  await cons.signConsultation(doc, c.id, { closeVisit: true });
  await lab.recordSample(labm, lr.id, "Sang");
  const it = await db.labRequestItem.findFirstOrThrow({ where: { labRequestId: lr.id } });
  await lab.enterResults(labm, lr.id, { items: [{ id: it.id, resultValue: "Positif (démo)", flag: "anormal" }], submit: true });
  await lab.validateResults(labm, lr.id);
  const inv1 = await billing.createPatientInvoice(cash, p1.id, "USD");
  await billing.recordPayment(cash, inv1.id, { amount: inv1.total.toString(), currency: "USD" });
  // Patient 2 : dentiste + rendez-vous, facture partiellement payée
  v = await reception.registerArrival(recep, p2.id, { doctorId: emp["demo.dentiste"], reason: "Douleur dentaire (démo)" });
  c = await cons.startConsultation(dent, v.id, dentS.id);
  await cons.saveConsultation(dent, c.id, { diagnosis: "Carie (démo)", form: { dent: "36", soin: "Obturation" } });
  await appts.createAppointment(dent, { patientId: p2.id, doctorId: emp["demo.dentiste"], specialtyId: dentS.id, scheduledAt: new Date(Date.now() + 2 * 86400e3 + 2 * 3600e3).toISOString().slice(0, 11) + "10:00", reason: "Contrôle (démo)" });
  await cons.signConsultation(dent, c.id, { closeVisit: true });
  const inv2 = await billing.createPatientInvoice(cash, p2.id, "USD");
  await billing.recordPayment(cash, inv2.id, { amount: "3", currency: "USD" });
  await billing.requestCredit(cash, inv2.id, "Demande fictive de démonstration");
  // Patient 3 : hospitalisée (maternité), en attente
  await hosp.admit(hp, { patientId: p3.id, type: "MATERNITY", reason: "Surveillance (démo)", bedId: (await db.bed.findFirstOrThrow({ where: { roomId: room.id, code: "1" } })).id });
  await reception.registerArrival(recep, (await mk("Paluku", "Joseph", "M", "1975-07-07", "0990000004")).id, { reason: "Contrôle (démo)" });
  console.log("Démonstration prête. Comptes : demo.admin, demo.finance, … — mot de passe :", DEMO_PASSWORD);
}
main().then(() => db.$disconnect(), async (e) => { console.error("Erreur :", e.message); await db.$disconnect(); process.exit(1); });
