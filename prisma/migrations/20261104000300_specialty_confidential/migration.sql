-- Spécialités confidentielles. Ajout uniquement. Annulation : down.sql

-- AlterTable
ALTER TABLE "Specialty" ADD COLUMN     "confidential" BOOLEAN NOT NULL DEFAULT false;

