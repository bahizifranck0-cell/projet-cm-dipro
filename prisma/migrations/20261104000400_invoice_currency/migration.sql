-- Conversion de devises sur les factures. Ajouts uniquement. Annulation : down.sql

-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "amountInInvoiceCcy" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "exchangeRate" DECIMAL(14,4);

ALTER TABLE "Charge" ADD CONSTRAINT charge_invoiced_amount_non_negative CHECK ("amountInInvoiceCcy" IS NULL OR "amountInInvoiceCcy" >= 0);
