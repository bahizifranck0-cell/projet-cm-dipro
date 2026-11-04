-- CMD Pro : protections d'intégrité au niveau de la base.
-- Annulation possible : voir down.sql dans ce dossier.

-- 1. Tables en ajout seul : ni modification ni suppression.
CREATE OR REPLACE FUNCTION cmdpro_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CMDPRO_IMMUTABLE: la table % est en ajout seul (opération % refusée)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable      BEFORE UPDATE OR DELETE ON "AuditLog"      FOR EACH ROW EXECUTE FUNCTION cmdpro_forbid_change();
CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION cmdpro_forbid_change();
CREATE TRIGGER payment_immutable        BEFORE UPDATE OR DELETE ON "Payment"       FOR EACH ROW EXECUTE FUNCTION cmdpro_forbid_change();
CREATE TRIGGER ledger_entry_immutable   BEFORE UPDATE OR DELETE ON "LedgerEntry"   FOR EACH ROW EXECUTE FUNCTION cmdpro_forbid_change();
-- TRUNCATE contourne les triggers de ligne : on l'interdit aussi.
CREATE TRIGGER audit_log_no_truncate      BEFORE TRUNCATE ON "AuditLog"      EXECUTE FUNCTION cmdpro_forbid_change();
CREATE TRIGGER stock_movement_no_truncate BEFORE TRUNCATE ON "StockMovement" EXECUTE FUNCTION cmdpro_forbid_change();
CREATE TRIGGER payment_no_truncate        BEFORE TRUNCATE ON "Payment"       EXECUTE FUNCTION cmdpro_forbid_change();
CREATE TRIGGER ledger_entry_no_truncate   BEFORE TRUNCATE ON "LedgerEntry"   EXECUTE FUNCTION cmdpro_forbid_change();

-- 2. Stock jamais négatif, seuils et quantités cohérents.
ALTER TABLE "Product" ADD CONSTRAINT product_qty_non_negative CHECK ("quantityOnHand" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT product_min_non_negative CHECK ("minStockLevel" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT product_price_non_negative CHECK ("price" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_qty_non_zero CHECK ("quantity" <> 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_balance_non_negative CHECK ("balanceAfter" >= 0);
ALTER TABLE "SaleItem" ADD CONSTRAINT sale_item_qty_positive CHECK ("quantity" > 0);

-- 3. Montants.
ALTER TABLE "TariffItem" ADD CONSTRAINT tariff_price_non_negative CHECK ("price" >= 0);
ALTER TABLE "Charge" ADD CONSTRAINT charge_qty_positive CHECK ("quantity" > 0);
ALTER TABLE "Charge" ADD CONSTRAINT charge_price_non_negative CHECK ("unitPrice" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_non_zero CHECK ("amount" <> 0);
-- Un montant négatif n'est permis que pour une extourne.
ALTER TABLE "Payment" ADD CONSTRAINT payment_negative_only_reversal CHECK ("amount" > 0 OR "reversalOfId" IS NOT NULL);
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_amounts_valid CHECK ("total" >= 0 AND "discountTotal" >= 0 AND "amountPaid" >= 0);
ALTER TABLE "Discount" ADD CONSTRAINT discount_positive CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT expense_positive CHECK ("amount" > 0);
ALTER TABLE "CreditRequest" ADD CONSTRAINT credit_positive CHECK ("amount" > 0);
ALTER TABLE "ExchangeRate" ADD CONSTRAINT rate_positive CHECK ("rate" > 0 AND "baseCurrency" <> "quoteCurrency");
ALTER TABLE "PayrollItem" ADD CONSTRAINT payroll_positive CHECK ("amount" > 0);

-- 4. Lits : un seul séjour ouvert par lit, et un seul lit ouvert par admission.
CREATE UNIQUE INDEX bed_one_open_assignment       ON "BedAssignment" ("bedId")       WHERE "endAt" IS NULL;
CREATE UNIQUE INDEX admission_one_open_assignment ON "BedAssignment" ("admissionId") WHERE "endAt" IS NULL;
ALTER TABLE "BedAssignment" ADD CONSTRAINT bed_assignment_dates CHECK ("endAt" IS NULL OR "endAt" >= "startAt");

-- 5. Un patient n'a qu'une admission active à la fois.
CREATE UNIQUE INDEX patient_one_active_admission ON "Admission" ("patientId") WHERE "status" = 'ACTIVE';

-- 6. Une seule demande de crédit en attente par facture.
CREATE UNIQUE INDEX invoice_one_pending_credit ON "CreditRequest" ("invoiceId") WHERE "status" = 'PENDING';

-- 7. Session liée soit à un employé, soit à un patient (jamais les deux).
ALTER TABLE "Session" ADD CONSTRAINT session_one_owner CHECK (("userId" IS NULL) <> ("patientAccountId" IS NULL));

-- 8. Une seule affectation active d'un médecin à une même spécialité.
CREATE UNIQUE INDEX doctor_assignment_active_unique ON "DoctorAssignment" ("employeeId", "specialtyId") WHERE "active";
