ALTER TABLE "Charge" DROP CONSTRAINT IF EXISTS charge_invoiced_amount_non_negative, DROP COLUMN IF EXISTS "amountInInvoiceCcy";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "exchangeRate";
