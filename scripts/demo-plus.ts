// Enrichissement de la DÉMONSTRATION (données fictives) : chaque compte de démo trouve du travail en cours
// et un historique dans son module. Tout passe par les services de l'application (mêmes règles, mêmes liens
// entre modules). N'est appelé que par scripts/seed-demo.ts, qui refuse toute base hors instance de démonstration.
//
// Robustesse (plusieurs constructions Vercel peuvent démarrer en même temps) :
// - verrou « demo.enrichissement.verrou » : une seule exécution à la fois ;
// - chaque étape est marquée faite (« demo.enrichissement.v1:<étape> ») et n'est jamais refaite ;
// - une étape dont les données existent déjà (exécution interrompue) est reconnue et marquée sans rien recréer.
import { Prisma } from "@prisma/client";
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

const PREFIX = "demo.enrichissement.v1";
const LOCK = "demo.enrichissement.verrou";
const day = (offset: number) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);
const period = () => new Date().toISOString().slice(0, 7);

const PRODUCTS = [
  ["Ibuprofène 400 mg — boîte (démo)", "3.00", "USD", 5, 30], ["Sérum physiologique 500 ml (démo)", "1.80", "USD", 10, 4],
  ["Gants d'examen — boîte (démo)", "6.50", "USD", 3, 12], ["Artéméther-luméfantrine — plaquette (démo)", "2.50", "USD", 10, 8],
  ["Compresses stériles (démo)", "1500", "CDF", 20, 60], ["Solution de réhydratation orale (démo)", "800", "CDF", 15, 9],
] as const;
const PATIENTS = {
  A: ["Kasereka", "Moïse", "M", "1979-03-14", "0990000011"], B: ["Mapendo", "Grâce", "F", "2001-08-02", "0990000012"],
  C: ["Ndoole", "Patient", "M", "1965-12-24", "0990000013"], D: ["Sifa", "Neema", "F", "2015-04-09", "0990000014"],
  E: ["Mumbere", "David", "M", "1992-06-30", "0990000015"], F: ["Kahindo", "Rose", "F", "1988-01-17", "0990000016"],
  G: ["Paluku", "Esther", "F", "1970-09-05", "0990000017"], H: ["Vahamwiti", "Samuel", "M", "1999-10-11", "0990000018"],
} as const;
type PKey = keyof typeof PATIENTS;

async function takeLock(log: (m: string) => void) {
  try { await db.setting.create({ data: { key: LOCK, value: { at: Date.now() } } }); return true; }
  catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    const cur = await db.setting.findUnique({ where: { key: LOCK } });
    const at = Number((cur?.value as { at?: number } | null)?.at ?? 0);
    if (Date.now() - at < 15 * 60e3) { log("Enrichissement de la démo déjà en cours dans une autre construction : ignoré ici."); return false; }
    const r = await db.setting.updateMany({ where: { key: LOCK, updatedAt: cur!.updatedAt }, data: { value: { at: Date.now() } } });
    return r.count === 1; // verrou abandonné (> 15 min) repris par une seule construction
  }
}

export async function enrichDemo(log: (m: string) => void = console.log) {
  if (await db.setting.findUnique({ where: { key: PREFIX } })) { log("Données de démonstration complètes : déjà en place."); return; }
  if (!(await takeLock(log))) return;
  try { await run(log); } finally { await db.setting.deleteMany({ where: { key: LOCK } }); }
}

async function run(log: (m: string) => void) {
  const done = async (step: string) => !!(await db.setting.findUnique({ where: { key: `${PREFIX}:${step}` } }));
  const mark = (step: string) => db.setting.upsert({ where: { key: `${PREFIX}:${step}` }, create: { key: `${PREFIX}:${step}`, value: { at: new Date().toISOString() } }, update: {} });
  /** Étape : sautée si marquée, marquée sans rien faire si ses données existent déjà (exécution interrompue). */
  const step = async (name: string, exists: () => Promise<boolean>, fn: () => Promise<void>) => {
    if (await done(name)) return;
    if (await exists()) { await mark(name); log(`· ${name} (déjà présent)`); return; }
    await fn(); await mark(name); log(`· ${name}`);
  };

  const A = async (u: string) => { const r = await login(u, DEMO_PASSWORD); if (!r.ok) throw new Error(`${u} : ${r.error}`); return (await actorFromToken(r.token))!; };
  const [admin, finA, doc, dent, secr, recep, cashA, labm, pharm, hp, nurse, rh, dg] = await Promise.all(
    ["demo.admin", "demo.finance", "demo.medecin", "demo.dentiste", "demo.secretaire", "demo.accueil", "demo.caisse", "demo.labo", "demo.pharmacie", "demo.hospit", "demo.infirmier", "demo.rh", "demo.dg"].map(A));
  const empOf = async (u: string) => (await db.user.findUniqueOrThrow({ where: { username: u } })).employeeId!;
  const gen = await db.specialty.findFirstOrThrow({ where: { name: "Médecine générale" } });
  const dentS = await db.specialty.findFirstOrThrow({ where: { name: "Dentisterie" } });
  const docEmp = await empOf("demo.medecin"), dentEmp = await empOf("demo.dentiste");

  /** Patient fictif : réutilisé s'il existe (même téléphone et même nom), sinon créé. */
  const P = async (k: PKey) => {
    const [l, f, sex, birth, phone] = PATIENTS[k];
    const found = await db.patient.findFirst({ where: { phone, lastName: `${l} (fictif)` }, orderBy: { createdAt: "asc" } });
    return found ?? (await patients.createPatient(secr, { lastName: `${l} (fictif)`, firstName: f, sex, birthDate: birth, phone, address: "Goma (adresse fictive)" }, { confirmedNotDuplicate: true })).patient!;
  };
  const product = async (name: string) => db.product.findFirst({ where: { name }, orderBy: { createdAt: "asc" } });

  await step("tarifs", async () => false, async () => {
    for (const [code, name, category, price] of [["LAB-NFS", "Hémogramme / NFS (démo)", "LAB", "6"], ["SOIN-PANS", "Pansement (démo)", "MEDICAL_SERVICE", "2"], ["URG-ACC", "Accueil des urgences (démo)", "CONSULTATION", "10"]] as const)
      if (!(await db.tariffItem.findUnique({ where: { code } }))) await billing.saveTariff(admin, { code, name, category, price, currency: "USD" });
    if (!(await db.labTest.findFirst({ where: { code: "NFS" } })))
      await lab.saveLabTest(labm, { code: "NFS", name: "Hémogramme / NFS (démo)", category: "Hématologie", sampleType: "Sang", tariffItemId: (await db.tariffItem.findUniqueOrThrow({ where: { code: "LAB-NFS" } })).id });
  });
  const nfs = await db.labTest.findFirstOrThrow({ where: { code: "NFS" } });
  const ge = await db.labTest.findFirstOrThrow({ where: { code: "GE" } });

  await step("pharmacie", async () => !!(await product(PRODUCTS[0][0])), async () => {
    for (const [n, p, c, min, q] of PRODUCTS) {
      const prod = await ph.createProduct(pharm, { name: n, price: p, currency: c, minStockLevel: min });
      await ph.stockEntry(pharm, prod.id, q, "Stock initial (démo)");
    }
    const para = await db.product.findFirstOrThrow({ where: { name: { startsWith: "Paracétamol" } } });
    await ph.directSale(pharm, [{ productId: para.id, quantity: 2 }, { productId: (await product(PRODUCTS[0][0]))!.id, quantity: 1 }], "Client de passage (fictif)");
    await ph.directSale(pharm, [{ productId: (await product("Compresses stériles (démo)"))!.id, quantity: 3 }], "Client de passage (fictif)");
  });

  await step("consultations", async () => !!(await db.patient.findFirst({ where: { phone: PATIENTS.A[4] } })), async () => {
    const consult = async (k: PKey, reason: string, diagnosis: string, tests: string[]) => {
      const v = await reception.registerArrival(recep, (await P(k)).id, { doctorId: docEmp, reason });
      const c = await cons.startConsultation(doc, v.id, gen.id);
      await cons.saveConsultation(doc, c.id, { observations: "Examen clinique fictif", diagnosis, treatment: "Traitement fictif", patientVisible: true });
      const lr = tests.length ? await lab.requestLab(doc, c.id, tests, reason) : null;
      await cons.signConsultation(doc, c.id, { closeVisit: true });
      return lr;
    };
    await consult("A", "Fièvre et frissons (démo)", "Suspicion de paludisme (démo)", [ge.id]);
    const lrB = await consult("B", "Fatigue (démo)", "Anémie à confirmer (démo)", [nfs.id]);
    await lab.recordSample(labm, lrB!.id, "Sang");
    const lrC = await consult("C", "Contrôle (démo)", "Suivi chronique (démo)", [nfs.id, ge.id]);
    await lab.recordSample(labm, lrC!.id, "Sang");
    const items = await db.labRequestItem.findMany({ where: { labRequestId: lrC!.id } });
    await lab.enterResults(labm, lrC!.id, { items: items.map((i, k) => ({ id: i.id, resultValue: k ? "Négatif (démo)" : "Hb 10,2 g/dl (démo)", flag: k ? "normal" : "anormal" })), submit: true });
    await consult("E", "Toux (démo)", "Bronchite aiguë (démo)", []);
  });

  await step("accueil", async () => !!(await db.appointment.findFirst({ where: { reason: "Résultat d'analyse (démo)" } })), async () => {
    // File d'attente : deux patients pour le médecin, un pour le dentiste, une urgence à orienter
    for (const [k, doctorId, reason] of [["F", docEmp, "Maux de tête (démo)"], ["G", docEmp, "Douleurs articulaires (démo)"], ["H", dentEmp, "Douleur dentaire (démo)"]] as const) {
      const p = await P(k);
      if (!(await db.visit.findFirst({ where: { patientId: p.id, status: { in: ["WAITING", "ORIENTED", "IN_CONSULTATION"] } } }))) await reception.registerArrival(recep, p.id, { doctorId, reason });
    }
    const d = await P("D");
    if (!(await db.visit.findFirst({ where: { patientId: d.id, status: { in: ["WAITING", "ORIENTED"] } } }))) await reception.registerArrival(recep, d.id, { reason: "Enfant fébrile (démo)", priority: true });
    for (const [k, doctorId, sp, when, reason] of [
      ["A", docEmp, gen.id, `${day(1)}T09:00`, "Résultat d'analyse (démo)"], ["E", docEmp, gen.id, `${day(2)}T11:30`, "Contrôle (démo)"],
      ["B", docEmp, gen.id, `${day(3)}T08:30`, "Suivi anémie (démo)"], ["H", dentEmp, dentS.id, `${day(1)}T14:00`, "Soin dentaire (démo)"],
      ["F", dentEmp, dentS.id, `${day(6)}T10:00`, "Détartrage (démo)"],
    ] as const) await appts.createAppointment(secr, { patientId: (await P(k)).id, doctorId, specialtyId: sp, scheduledAt: when, reason });
    for (const [k, doctorId, sp, h] of [["G", docEmp, gen.id, 2], ["E", dentEmp, dentS.id, 3]] as const) {
      const t = new Date(Date.now() + h * 3600e3);
      if (t.getDate() !== new Date().getDate()) continue;
      const local = new Date(t.getTime() - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 13) + ":00";
      await appts.createAppointment(secr, { patientId: (await P(k)).id, doctorId, specialtyId: sp, scheduledAt: local, reason: "Consultation du jour (démo)" }).catch(() => undefined);
    }
  });

  await step("hospitalisation", async () => !!(await db.room.findFirst({ where: { code: "U1" } })), async () => {
    const room2 = await hosp.createRoom(hp, { code: "U1", name: "Urgences (démo)", category: "Urgences" });
    for (const b of ["1", "2"]) await hosp.addBed(hp, room2.id, b);
    const room3 = await hosp.createRoom(hp, { code: "P1", name: "Chambre privée (démo)", category: "Privée" });
    await hosp.addBed(hp, room3.id, "1");
    const bedU1 = await db.bed.findFirstOrThrow({ where: { roomId: room2.id, code: "1" } });
    const bedP1 = await db.bed.findFirstOrThrow({ where: { roomId: room3.id, code: "1" } });
    const admU = await hosp.admit(hp, { patientId: (await P("C")).id, type: "EMERGENCY", reason: "Malaise (démo)", bedId: bedU1.id });
    const admH = await hosp.admit(hp, { patientId: (await P("A")).id, type: "HOSPITALIZATION", reason: "Paludisme grave à surveiller (démo)", bedId: bedP1.id });
    await hosp.addNote(nurse, admU.id, "Constantes", "TA 13/8, pouls 88, température 37,9 °C (démo)");
    await hosp.addNote(nurse, admH.id, "Soins", "Perfusion posée à 8 h ; patient calme (démo)");
    await hosp.addNote(hp, admH.id, "Observation", "Amélioration clinique (démo)");
    const mat = await db.admission.findFirst({ where: { status: "ACTIVE", type: "MATERNITY" } });
    if (mat) await hosp.addNote(nurse, mat.id, "Surveillance", "Contractions espacées, bonne vitalité fœtale (démo)");
    const serum = await product("Sérum physiologique 500 ml (démo)");
    if (serum) await ph.consumeForPatient(hp, { patientId: (await P("A")).id, productId: serum.id, quantity: 2, reason: "Perfusion (démo)" }).catch(() => undefined);
  });

  await step("caisse", async () => !!(await db.cashOperation.findFirst({ where: { description: "Course moto pour prélèvements (démo)" } })), async () => {
    // Une session restée ouverte (ex. construction interrompue) est d'abord clôturée au montant attendu.
    const closeExact = async (currency: "USD" | "CDF", notes: string) => {
      const s = await cash.currentSession(cashA, currency);
      if (!s) return;
      const counts: Record<string, string> = {}; let rest = Math.floor(Number(s.expected));
      for (const d of cash.DENOMINATIONS[currency]) { counts[String(d)] = String(Math.floor(rest / d)); rest %= d; }
      await cash.closeSession(cashA, { currency, counts, notes });
    };
    await closeExact("USD", "Clôture avant reprise (démo)"); await closeExact("CDF", "Clôture avant reprise (démo)");
    const invoiceOf = async (k: PKey) => {
      const p = await P(k);
      return (await billing.createPatientInvoice(cashA, p.id, "USD").catch(() => null))
        ?? await db.invoice.findFirst({ where: { patientId: p.id, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, orderBy: { createdAt: "desc" } });
    };
    const invE = await invoiceOf("E"), invB = await invoiceOf("B");
    const saleInv = await db.invoice.findFirst({ where: { type: "DIRECT_SALE", currency: "USD", status: "ISSUED", sale: { customerName: "Client de passage (fictif)" } }, orderBy: { createdAt: "asc" } }).catch(() => null);
    await cash.openSession(cashA, { currency: "USD", openingFloat: "100", notes: "Session du matin (démo)" });
    if (invE) await billing.recordPayment(cashA, invE.id, { amount: invE.total.sub(invE.amountPaid).toString(), currency: "USD" }).catch(() => undefined);
    await cash.createOperation(cashA, { type: "OUT", currency: "USD", amount: "12", category: "transport", method: "cash", description: "Course moto pour prélèvements (démo)" });
    await cash.createOperation(cashA, { type: "IN", currency: "USD", amount: "40", category: "apport", method: "cash", description: "Appoint de monnaie (démo)" });
    await closeExact("USD", "Clôture du matin (démo)");
    await cash.openSession(cashA, { currency: "USD", openingFloat: "80", notes: "Session de l'après-midi (démo)" });
    if (invB) await billing.recordPayment(cashA, invB.id, { amount: "5", currency: "USD" }).catch(() => undefined);
    if (saleInv) await billing.recordPayment(cashA, saleInv.id, { amount: saleInv.total.toString(), currency: "USD" }).catch(() => undefined);
    await cash.createOperation(cashA, { type: "OUT", currency: "USD", amount: "7.50", category: "achats", method: "cash", description: "Fournitures de bureau (démo)" });
    await cash.createOperation(cashA, { type: "IN", currency: "USD", amount: "15", category: "remboursement", method: "mobile", description: "Remboursement d'avance (démo)" });
    await cash.openSession(cashA, { currency: "CDF", openingFloat: "50000", notes: "Caisse en francs (démo)" });
    await cash.createOperation(cashA, { type: "OUT", currency: "CDF", amount: "8000", category: "electricite", method: "cash", description: "Unités d'électricité (démo)" });
  });

  await step("credits", async () => !!(await db.creditRequest.findFirst({ where: { reason: "Patient sans ressources, famille absente (démo)" } })), async () => {
    const pC = await P("C");
    const inv = (await billing.createPatientInvoice(cashA, pC.id, "USD").catch(() => null))
      ?? await db.invoice.findFirst({ where: { patientId: pC.id, status: "ISSUED", debt: null } });
    if (!inv) return;
    const cr = await billing.requestCredit(cashA, inv.id, "Patient sans ressources, famille absente (démo)");
    await billing.decideCredit(dg, cr.id, true, "Accordé pour raison humanitaire (démo)");
    await billing.recordPayment(cashA, inv.id, { amount: "2", currency: "USD" }).catch(() => undefined);
  });

  await step("finance", async () => !!(await db.expenseCategory.findFirst({ where: { name: "Fournitures médicales (démo)" } })), async () => {
    const deps = await db.department.findMany();
    const depOf = (n: string) => (deps.find((d) => d.name.startsWith(n)) ?? deps[0]).id;
    const cat: Record<string, string> = {};
    for (const n of ["Fournitures médicales (démo)", "Carburant groupe électrogène (démo)", "Maintenance (démo)"]) cat[n] = (await fin.createCategory(finA, n)).id;
    await fin.createExpense(finA, { departmentId: depOf("Laboratoire"), categoryId: cat["Fournitures médicales (démo)"], description: "Réactifs de laboratoire (démo)", amount: "120", currency: "USD" });
    const e2 = await fin.createExpense(finA, { departmentId: depOf("Administration"), categoryId: cat["Carburant groupe électrogène (démo)"], description: "Gasoil 40 litres (démo)", amount: "60", currency: "USD" });
    await fin.decideExpense(admin, e2.id, true); await fin.payExpense(finA, e2.id);
    const e3 = await fin.createExpense(finA, { departmentId: depOf("Urgences"), categoryId: cat["Maintenance (démo)"], description: "Réparation d'un lit (démo)", amount: "25", currency: "USD" });
    await fin.decideExpense(admin, e3.id, true);
    await fin.createReconciliation(finA, { period: period(), currency: "USD", counted: "0", notes: "Réconciliation de démonstration" }).catch(() => undefined);
  });

  await step("personnel", async () => (await db.employeeContract.count()) > 0, async () => {
    const start = `${new Date().getUTCFullYear()}-01-01`;
    for (const [u, salary] of [["demo.medecin", "900"], ["demo.dentiste", "850"], ["demo.infirmier", "350"], ["demo.caisse", "300"], ["demo.labo", "450"], ["demo.pharmacie", "500"]] as const)
      await hr.addContract(rh, await empOf(u), { type: "CDI", startDate: start, baseSalary: salary, currency: "USD" });
    await hr.addPayrollItem(rh, await empOf("demo.infirmier"), { period: period(), type: "ADVANCE", amount: "50", currency: "USD", description: "Avance sur salaire (démo)" });
    await hr.addPayrollItem(rh, await empOf("demo.medecin"), { period: period(), type: "BONUS", amount: "100", currency: "USD", description: "Prime de garde (démo)" });
    await hr.generatePayslip(rh, await empOf("demo.caisse"), period()).catch(() => undefined);
    await hr.requestLeave(rh, await empOf("demo.infirmier"), { type: "Congé annuel", startDate: day(10), endDate: day(20), reason: "Congé de démonstration" });
    const l2 = await hr.requestLeave(rh, await empOf("demo.labo"), { type: "Congé de maladie", startDate: day(-12), endDate: day(-9), reason: "Repos médical (démo)" });
    await hr.decideLeave(admin, l2.id, true).catch(() => undefined);
  });

  await db.setting.upsert({ where: { key: PREFIX }, create: { key: PREFIX, value: { at: new Date().toISOString() } }, update: {} });
  log("Données de démonstration complètes.");
}
