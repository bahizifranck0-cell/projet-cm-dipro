import type { ChargeSource, TariffCategory } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";

/**
 * Ajoute une prestation au compte du patient avec le TARIF OFFICIEL du catalogue (jamais saisi à la main).
 * Si aucun tarif n'est configuré, rien n'est facturé et l'appelant en est informé (à configurer par l'hôpital).
 */
export async function chargeFromTariff(tx: Tx, input: {
  patientId: string; visitId?: string | null; admissionId?: string | null; source: ChargeSource; sourceId: string;
  category: TariffCategory; specialtyId?: string | null; tariffItemId?: string | null; departmentId?: string | null;
  quantity?: number; description?: string; createdById: string;
}) {
  const tariff = input.tariffItemId
    ? await tx.tariffItem.findFirst({ where: { id: input.tariffItemId, active: true } })
    : await tx.tariffItem.findFirst({
        where: { active: true, category: input.category, OR: [{ specialtyId: input.specialtyId ?? undefined }, { specialtyId: null }] },
        orderBy: { specialtyId: { sort: "asc", nulls: "last" } }, // le tarif propre à la spécialité passe en premier
      });
  if (!tariff) return null;
  const qty = new Prisma.Decimal(input.quantity ?? 1);
  return tx.charge.create({
    data: {
      patientId: input.patientId, visitId: input.visitId ?? null, admissionId: input.admissionId ?? null,
      source: input.source, sourceId: input.sourceId, tariffItemId: tariff.id, departmentId: input.departmentId ?? tariff.departmentId,
      description: input.description ?? tariff.name, quantity: qty, unitPrice: tariff.price, currency: tariff.currency,
      total: tariff.price.mul(qty), createdById: input.createdById,
    },
  });
}

/** Annule les prestations non encore facturées d'un acte annulé. */
export async function cancelChargesFor(tx: Tx, source: ChargeSource, sourceId: string, userId: string, reason: string) {
  return tx.charge.updateMany({
    where: { source, sourceId, status: "ACTIVE", invoiceId: null },
    data: { status: "CANCELLED", cancelledById: userId, cancelledAt: new Date(), cancelReason: reason },
  });
}

export const dbForCharges = db;
