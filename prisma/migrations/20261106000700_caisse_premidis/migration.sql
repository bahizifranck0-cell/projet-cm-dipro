-- Module Caisse (transfert PREMIDIS) : sessions avec billetage, opérations d'entrée et de sortie.
-- Ajouts uniquement (aucune donnée existante modifiée). Annulation : down.sql

-- CreateEnum
CREATE TYPE "CashOpType" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN "closedById" TEXT,
ADD COLUMN "denominations" JSONB,
ADD COLUMN "totalIn" DECIMAL(14,2),
ADD COLUMN "totalOut" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "CashOperation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "CashOpType" NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "description" TEXT,
    "paymentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashOperation_number_key" ON "CashOperation"("number");
CREATE UNIQUE INDEX "CashOperation_paymentId_key" ON "CashOperation"("paymentId");
CREATE INDEX "CashOperation_sessionId_createdAt_idx" ON "CashOperation"("sessionId", "createdAt");
CREATE INDEX "CashOperation_createdAt_idx" ON "CashOperation"("createdAt");
CREATE INDEX "CashSession_currency_closedAt_idx" ON "CashSession"("currency", "closedAt");

-- AddForeignKey
ALTER TABLE "CashOperation" ADD CONSTRAINT "CashOperation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Une seule session ouverte par devise
CREATE UNIQUE INDEX "CashSession_one_open_per_currency" ON "CashSession"("currency") WHERE "closedAt" IS NULL;

-- Montant strictement positif ; opérations jamais modifiées ni supprimées
ALTER TABLE "CashOperation" ADD CONSTRAINT "CashOperation_amount_positive" CHECK ("amount" > 0);
CREATE TRIGGER cash_operation_immutable   BEFORE UPDATE OR DELETE ON "CashOperation" FOR EACH ROW EXECUTE FUNCTION cmdpro_forbid_change();
CREATE TRIGGER cash_operation_no_truncate BEFORE TRUNCATE ON "CashOperation" EXECUTE FUNCTION cmdpro_forbid_change();
