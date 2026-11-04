-- Annulation manuelle de 20261104000100_integrity_guards (ne supprime aucune donnée).
DROP INDEX IF EXISTS doctor_assignment_active_unique, invoice_one_pending_credit, patient_one_active_admission,
  admission_one_open_assignment, bed_one_open_assignment;
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS session_one_owner;
ALTER TABLE "BedAssignment" DROP CONSTRAINT IF EXISTS bed_assignment_dates;
ALTER TABLE "PayrollItem" DROP CONSTRAINT IF EXISTS payroll_positive;
ALTER TABLE "ExchangeRate" DROP CONSTRAINT IF EXISTS rate_positive;
ALTER TABLE "CreditRequest" DROP CONSTRAINT IF EXISTS credit_positive;
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS expense_positive;
ALTER TABLE "Discount" DROP CONSTRAINT IF EXISTS discount_positive;
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS invoice_amounts_valid;
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS payment_negative_only_reversal, DROP CONSTRAINT IF EXISTS payment_amount_non_zero;
ALTER TABLE "Charge" DROP CONSTRAINT IF EXISTS charge_price_non_negative, DROP CONSTRAINT IF EXISTS charge_qty_positive;
ALTER TABLE "TariffItem" DROP CONSTRAINT IF EXISTS tariff_price_non_negative;
ALTER TABLE "SaleItem" DROP CONSTRAINT IF EXISTS sale_item_qty_positive;
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS stock_balance_non_negative, DROP CONSTRAINT IF EXISTS stock_qty_non_zero;
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS product_price_non_negative, DROP CONSTRAINT IF EXISTS product_min_non_negative, DROP CONSTRAINT IF EXISTS product_qty_non_negative;
DROP TRIGGER IF EXISTS audit_log_immutable ON "AuditLog";
DROP TRIGGER IF EXISTS stock_movement_immutable ON "StockMovement";
DROP TRIGGER IF EXISTS payment_immutable ON "Payment";
DROP TRIGGER IF EXISTS ledger_entry_immutable ON "LedgerEntry";
DROP TRIGGER IF EXISTS audit_log_no_truncate ON "AuditLog";
DROP TRIGGER IF EXISTS stock_movement_no_truncate ON "StockMovement";
DROP TRIGGER IF EXISTS payment_no_truncate ON "Payment";
DROP TRIGGER IF EXISTS ledger_entry_no_truncate ON "LedgerEntry";
DROP FUNCTION IF EXISTS cmdpro_forbid_change();
