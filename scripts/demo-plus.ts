// Enrichissement de la DÉMONSTRATION (données fictives) : chaque compte de démo trouve du travail en cours
// et un historique dans son module. Tout passe par les services de l'application (mêmes règles, mêmes liens
// entre modules). Idempotent : marqueur « demo.enrichissement.v1 » dans Setting.
// N'est appelé que par scripts/seed-demo.ts, qui refuse toute base qui n'est pas une instance de démonstration.
import { db } from "../src/server/db";
import { DEMO_PASSWORD } from "../src/lib/demo";
import { actorFromToken } from "../src/server/services/sessions";
import { login } from "../src/server/services/auth";
import * as patients from "../src/server/services/patients";
import * as reception from "../src/server/services/reception";
import * as cons from "../src/server/services/consultations";
import * as lab from "../src/server/services/laboratory";
import * as ph from "../src/server/services/pharmacy";
import * as billing from "../src/server/services/billing";
import * as hosp from "../src/server/services/hospitalization";
import * as appts from "../src/server/services/appointments";
import * as cash from "../src/server/services/cash";
import * as fin from "../src/server/services/finance";
import * as hr from "../src/server/services/hr";

const MARK = "demo.enrichissement.v1";
const day = (offset: number, hm: string) => { const d = new Date(Date.now() + offset * 86400e3); return `${d.toISOString().slice(0, 10)}T${hm}`; };
const period = () => new Date().toISOString().slice(0, 7);

export async function enrichDemo(log: (m: string) => void = console.log) {
  if (await db.setting.findUnique({ where: { key: MARK } })) { log("Données de démonstration complètes : déjà en place."); return; }
  const A = async (u: string) => { const r = await login(u, DEMO_PASSWORD); if (!r.ok) throw new Error(`${u} : ${r.error}`); return (await actorFromToken(r.token))!; };
  const [admin, finA, doc, dent, secr, recep, cashA, labm, pharm, hp, nurse, rh, dg] = await Promise.all(
    ["demo.admin", "demo.finance", "demo.medecin", "demo.dentiste", "demo.secretaire", "demo.accueil", "demo.caisse", "demo.labo", "demo.pharmacie", "demo.hospit", "demo.infirmier", "demo.rh", "demo.dg"].map(A));
  const empOf = async (u: string) => (await db.user.findUniqueOrThrow({ where: { username: u } })).employeeId!;
  const gen = await db.specialty.findFirstOrThrow({ where: { name: "Médecine générale" } });
  const dentS = await db.specialty.findFirstOrThrow({ where: { name: "Dentisterie" } });
  const docEmp = await empOf("demo.medecin"), dentEmp = await empOf("demo.dentiste");
  const mk = async (l: string, f: string, sex: "F" | "M", birth: string, phone: string) =>
    (await patients.createPatient(secr, { lastName: `${l} (fictif)`, firstName: f, sex, birthDate: birth, phone, address: "Goma (adresse fictive)" }, { confirmedNotDuplicate: true })).patient!;

  // ── Tarifs et analyses ──
  for (const [code, name, category, price] of [["LAB-NFS", "Hémogramme / NFS (démo)", "LAB", "6"], ["SOIN-PANS", "Pansement (démo)", "MEDICAL_SERVICE", "2"], ["URG-ACC", "Accueil des urgences (démo)", "CONSULTATION", "10"]] as const)
    if (!(await db.tariffItem.findUnique({ where: { code } }))) await billing.saveTariff(admin, { code, name, category, price, currency: "USD" });
  const nfsTariff = await db.tariffItem.findUniqueOrThrow({ where: { code: "LAB-NFS" } });
  const nfs = (await db.labTest.findFirst({ where: { code: "NFS" } })) ?? await lab.saveLabTest(labm, { code: "NFS", name: "Hémogramme / NFS (démo)", category: "Hématologie", sampleType: "Sang", tariffItemId: nfsTariff.id });
  const ge = await db.labTest.findFirstOrThrow({ where: { code: "GE" } });
  log("· tarifs et analyses");

  // ── Pharmacie : catalogue, stock bas, vente directe ──
  const prods: Record<string, string> = {};
  for (const [n, p, c, min, q] of [
    ["Ibuprofène 400 mg — boîte (démo)", "3.00", "USD", 5, 30], ["Sérum physiologique 500 ml (démo)", "1.80", "USD", 10, 4],
    ["Gants d'examen — boîte (démo)", "6.50", "USD", 3, 12], ["Artéméther-luméfantrine — plaquette (démo)", "2.50", "USD", 10, 8],
    ["Compresses stériles (démo)", "1500", "CDF", 20, 60], ["Solution de réhydratation orale (démo)", "800", "CDF", 15, 9],
  ] as const) {
    const prod = await ph.createProduct(pharm, { name: n, price: p, currency: c, minStockLevel: min });
    await ph.stockEntry(pharm, prod.id, q, "Stock initial (démo)"); prods[n] = prod.id;
  }
  const para = await db.product.findFirstOrThrow({ where: { name: { startsWith: "Paracétamol" } } });
  const sale = await ph.directSale(pharm, [{ productId: para.id, quantity: 2 }, { productId: prods["Ibuprofène 400 mg — boîte (démo)"], quantity: 1 }], "Client de passage (fictif)");
  await ph.directSale(pharm, [{ productId: prods["Compresses stériles (démo)"], quantity: 3 }], "Client de passage (fictif)");
  log("· pharmacie");

  // ── Patients et parcours médicaux ──
  const pA = await mk("Kasereka", "Moïse", "M", "1979-03-14", "0990000011");
  const pB = await mk("Mapendo", "Grâce", "F", "2001-08-02", "0990000012");
  const pC = await mk("Ndoole", "Patient", "M", "1965-12-24", "0990000013");
  const pD = await mk("Sifa", "Neema", "F", "2015-04-09", "0990000014");
  const pE = await mk("Mumbere", "David", "M", "1992-06-30", "0990000015");
  const pF = await mk("Kahindo", "Rose", "F", "1988-01-17", "0990000016");
  const pG = await mk("Paluku", "Esther", "F", "1970-09-05", "0990000017");
  const pH = await mk("Vahamwiti", "Samuel", "M", "1999-10-11", "0990000018");

  // Analyses à chaque étape (laboratoire) : demandée, prélevée, soumise (à valider)
  const consult = async (p: { id: string }, reason: string, diagnosis: string, tests: string[]) => {
    const v = await reception.registerArrival(recep, p.id, { doctorId: docEmp, reason });
    const c = await cons.startConsultation(doc, v.id, gen.id);
    await cons.saveConsultation(doc, c.id, { observations: "Examen clinique fictif", diagnosis, treatment: "Traitement fictif", patientVisible: true });
    const lr = tests.length ? await lab.requestLab(doc, c.id, tests, reason) : null;
    await cons.signConsultation(doc, c.id, { closeVisit: true });
    return lr;
  };
  await consult(pA, "Fièvre et frissons (démo)", "Suspicion de paludisme (démo)", [ge.id]);
  const lrB = await consult(pB, "Fatigue (démo)", "Anémie à confirmer (démo)", [nfs.id]);
  await lab.recordSample(labm, lrB!.id, "Sang");
  const lrC = await consult(pC, "Contrôle (démo)", "Suivi chronique (démo)", [nfs.id, ge.id]);
  await lab.recordSample(labm, lrC!.id, "Sang");
  const itemsC = await db.labRequestItem.findMany({ where: { labRequestId: lrC!.id } });
  await lab.enterResults(labm, lrC!.id, { items: itemsC.map((i, k) => ({ id: i.id, resultValue: k ? "Négatif (démo)" : "Hb 10,2 g/dl (démo)", flag: k ? "normal" : "anormal" })), submit: true });
  await consult(pE, "Toux (démo)", "Bronchite aiguë (démo)", []);
  log("· consultations et laboratoire");

  // File d'attente du jour : réception, médecin, dentiste, urgence à orienter
  await reception.registerArrival(recep, pF.id, { doctorId: docEmp, reason: "Maux de tête (démo)" });
  await reception.registerArrival(recep, pG.id, { doctorId: docEmp, reason: "Douleurs articulaires (démo)" });
  await reception.registerArrival(recep, pH.id, { doctorId: dentEmp, reason: "Douleur dentaire (démo)" });
  await reception.registerArrival(recep, pD.id, { reason: "Enfant fébrile (démo)", priority: true });

  // Rendez-vous : aujourd'hui, demain, la semaine prochaine
  for (const [p, d, sp, when, reason] of [
    [pA, docEmp, gen.id, day(1, "09:00"), "Résultat d'analyse (démo)"], [pE, docEmp, gen.id, day(2, "11:30"), "Contrôle (démo)"],
    [pB, docEmp, gen.id, day(3, "08:30"), "Suivi anémie (démo)"], [pH, dentEmp, dentS.id, day(1, "14:00"), "Soin dentaire (démo)"],
    [pF, dentEmp, dentS.id, day(6, "10:00"), "Détartrage (démo)"],
  ] as const) await appts.createAppointment(secr, { patientId: p.id, doctorId: d, specialtyId: sp, scheduledAt: when, reason });
  // Rendez-vous plus tard dans la journée (si l'heure le permet), pour l'agenda « aujourd'hui »
  for (const [p, d, sp, h] of [[pG, docEmp, gen.id, 2], [pE, dentEmp, dentS.id, 3]] as const) {
    const t = new Date(Date.now() + h * 3600e3);
    if (t.getDate() !== new Date().getDate()) continue;
    const local = new Date(t.getTime() - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 13) + ":00";
    await appts.createAppointment(secr, { patientId: p.id, doctorId: d, specialtyId: sp, scheduledAt: local, reason: "Consultation du jour (démo)" }).catch(() => undefined);
  }
  log("· file d'attente et rendez-vous");

  // ── Hospitalisation : urgences, hospitalisation, notes infirmières, consommation ──
  const room2 = await hosp.createRoom(hp, { code: "U1", name: "Urgences (démo)", category: "Urgences" });
  for (const b of ["1", "2"]) await hosp.addBed(hp, room2.id, b);
  const room3 = await hosp.createRoom(hp, { code: "P1", name: "Chambre privée (démo)", category: "Privée" });
  await hosp.addBed(hp, room3.id, "1");
  const bedU1 = await db.bed.findFirstOrThrow({ where: { roomId: room2.id, code: "1" } });
  const bedP1 = await db.bed.findFirstOrThrow({ where: { roomId: room3.id, code: "1" } });
  const admU = await hosp.admit(hp, { patientId: pC.id, type: "EMERGENCY", reason: "Malaise (démo)", bedId: bedU1.id });
  const admH = await hosp.admit(hp, { patientId: pA.id, type: "HOSPITALIZATION", reason: "Paludisme grave à surveiller (démo)", bedId: bedP1.id });
  await hosp.addNote(nurse, admU.id, "Constantes", "TA 13/8, pouls 88, température 37,9 °C (démo)");
  await hosp.addNote(nurse, admH.id, "Soins", "Perfusion posée à 8 h ; patient calme (démo)");
  await hosp.addNote(hp, admH.id, "Observation", "Amélioration clinique (démo)");
  const mat = await db.admission.findFirst({ where: { status: "ACTIVE", type: "MATERNITY" } });
  if (mat) await hosp.addNote(nurse, mat.id, "Surveillance", "Contractions espacées, bonne vitalité fœtale (démo)");
  await ph.consumeForPatient(hp, { patientId: pA.id, productId: prods["Sérum physiologique 500 ml (démo)"], quantity: 2, reason: "Perfusion (démo)" }).catch(() => undefined);
  log("· hospitalisation");

  // ── Caisse : une session clôturée (historique), une session USD ouverte, une session CDF ouverte ──
  const invE = await billing.createPatientInvoice(cashA, pE.id, "USD");
  const invB = await billing.createPatientInvoice(cashA, pB.id, "USD");
  await cash.openSession(cashA, { currency: "USD", openingFloat: "100", notes: "Session du matin (démo)" });
  await billing.recordPayment(cashA, invE.id, { amount: invE.total.toString(), currency: "USD" });
  await cash.createOperation(cashA, { type: "OUT", currency: "USD", amount: "12", category: "transport", method: "cash", description: "Course moto pour prélèvements (démo)" });
  await cash.createOperation(cashA, { type: "IN", currency: "USD", amount: "40", category: "apport", method: "cash", description: "Appoint de monnaie (démo)" });
  const exp1 = (await cash.currentSession(cashA, "USD"))!.expected;
  const counts: Record<string, string> = {}; let rest = Math.floor(Number(exp1));
  for (const d of cash.DENOMINATIONS.USD) { counts[String(d)] = String(Math.floor(rest / d)); rest %= d; }
  await cash.closeSession(cashA, { currency: "USD", counts, notes: "Clôture du matin (démo)" });
  await cash.openSession(cashA, { currency: "USD", openingFloat: "80", notes: "Session de l'après-midi (démo)" });
  await billing.recordPayment(cashA, invB.id, { amount: "5", currency: "USD" });
  await billing.recordPayment(cashA, sale.invoice.id, { amount: sale.invoice.total.toString(), currency: "USD" });
  await cash.createOperation(cashA, { type: "OUT", currency: "USD", amount: "7.50", category: "achats", method: "cash", description: "Fournitures de bureau (démo)" });
  await cash.createOperation(cashA, { type: "IN", currency: "USD", amount: "15", category: "remboursement", method: "mobile", description: "Remboursement d'avance (démo)" });
  await cash.openSession(cashA, { currency: "CDF", openingFloat: "50000", notes: "Caisse en francs (démo)" });
  await cash.createOperation(cashA, { type: "OUT", currency: "CDF", amount: "8000", category: "electricite", method: "cash", description: "Unités d'électricité (démo)" });
  log("· caisse");

  // ── Crédits et dettes : une demande en attente du DG, une dette accordée et remboursée en partie ──
  const invG = await billing.createPatientInvoice(cashA, pC.id, "USD").catch(() => null);
  if (invG) {
    const cr = await billing.requestCredit(cashA, invG.id, "Patient sans ressources, famille absente (démo)");
    await billing.decideCredit(dg, cr.id, true, "Accordé pour raison humanitaire (démo)");
    await billing.recordPayment(cashA, invG.id, { amount: "2", currency: "USD" });
  }
  log("· crédits");

  // ── Finance : dépenses à chaque étape, réconciliation à valider ──
  const deps = await db.department.findMany();
  const depOf = (n: string) => deps.find((d) => d.name.startsWith(n))!.id;
  const cat: Record<string, string> = {};
  for (const n of ["Fournitures médicales (démo)", "Carburant groupe électrogène (démo)", "Maintenance (démo)"]) cat[n] = (await fin.createCategory(finA, n)).id;
  await fin.createExpense(finA, { departmentId: depOf("Laboratoire"), categoryId: cat["Fournitures médicales (démo)"], description: "Réactifs de laboratoire (démo)", amount: "120", currency: "USD" });
  const e2 = await fin.createExpense(finA, { departmentId: depOf("Administration"), categoryId: cat["Carburant groupe électrogène (démo)"], description: "Gasoil 40 litres (démo)", amount: "60", currency: "USD" });
  await fin.decideExpense(admin, e2.id, true); await fin.payExpense(finA, e2.id);
  const e3 = await fin.createExpense(finA, { departmentId: depOf("Urgences"), categoryId: cat["Maintenance (démo)"], description: "Réparation d'un lit (démo)", amount: "25", currency: "USD" });
  await fin.decideExpense(admin, e3.id, true);
  await fin.createReconciliation(finA, { period: period(), currency: "USD", counted: "0", notes: "Réconciliation de démonstration" }).catch(() => undefined);
  log("· finance");

  // ── Personnel / RH : contrats, avances et primes, bulletin, congés ──
  const start = `${new Date().getUTCFullYear()}-01-01`;
  for (const [u, salary] of [["demo.medecin", "900"], ["demo.dentiste", "850"], ["demo.infirmier", "350"], ["demo.caisse", "300"], ["demo.labo", "450"], ["demo.pharmacie", "500"]] as const)
    await hr.addContract(rh, await empOf(u), { type: "CDI", startDate: start, baseSalary: salary, currency: "USD" });
  await hr.addPayrollItem(rh, await empOf("demo.infirmier"), { period: period(), type: "ADVANCE", amount: "50", currency: "USD", description: "Avance sur salaire (démo)" });
  await hr.addPayrollItem(rh, await empOf("demo.medecin"), { period: period(), type: "BONUS", amount: "100", currency: "USD", description: "Prime de garde (démo)" });
  await hr.generatePayslip(rh, await empOf("demo.caisse"), period()).catch(() => undefined);
  await hr.requestLeave(rh, await empOf("demo.infirmier"), { type: "Congé annuel", startDate: day(10, "").slice(0, 10), endDate: day(20, "").slice(0, 10), reason: "Congé de démonstration" });
  const l2 = await hr.requestLeave(rh, await empOf("demo.labo"), { type: "Congé de maladie", startDate: day(-12, "").slice(0, 10), endDate: day(-9, "").slice(0, 10), reason: "Repos médical (démo)" });
  await hr.decideLeave(admin, l2.id, true).catch(() => undefined);
  log("· personnel");

  await db.setting.create({ data: { key: MARK, value: { at: new Date().toISOString() } } });
  log("Données de démonstration complètes.");
}
