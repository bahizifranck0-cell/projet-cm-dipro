import { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";

/**
 * Situation financière d'un patient pour la sortie :
 * - prestations pas encore facturées ⇒ facture à établir ;
 * - factures émises non soldées ⇒ paiement attendu ;
 * - sauf si un crédit a été APPROUVÉ par le Directeur général pour ces factures.
 */
export async function financialClearance(patientId: string, tx: Tx = db) {
  const [uninvoiced, invoices] = await Promise.all([
    tx.charge.count({ where: { patientId, status: "ACTIVE", invoiceId: null } }),
    tx.invoice.findMany({ where: { patientId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, include: { creditRequests: { where: { status: "APPROVED" } } } }),
  ]);
  const unpaid = invoices.filter((i) => i.creditRequests.length === 0);
  const balance = unpaid.reduce((s, i) => s.add(i.total.sub(i.amountPaid)), new Prisma.Decimal(0));
  const credited = invoices.filter((i) => i.creditRequests.length > 0);
  return {
    ok: uninvoiced === 0 && unpaid.length === 0,
    uninvoicedCharges: uninvoiced,
    unpaidInvoices: unpaid.map((i) => ({ id: i.id, number: i.number, balance: i.total.sub(i.amountPaid).toString(), currency: i.currency })),
    balance: balance.toString(),
    creditApprovedInvoices: credited.map((i) => i.number),
  };
}
