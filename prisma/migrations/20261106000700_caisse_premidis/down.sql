DROP TABLE IF EXISTS "CashOperation";
DROP TYPE IF EXISTS "CashOpType";
DROP INDEX IF EXISTS "CashSession_one_open_per_currency";
DROP INDEX IF EXISTS "CashSession_currency_closedAt_idx";
ALTER TABLE "CashSession" DROP COLUMN IF EXISTS "closedById", DROP COLUMN IF EXISTS "denominations", DROP COLUMN IF EXISTS "totalIn", DROP COLUMN IF EXISTS "totalOut";
