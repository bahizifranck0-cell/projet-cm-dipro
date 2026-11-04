-- CMD Pro : recherche patients et file d'attente. Ajouts uniquement : aucune donnée supprimée.
-- Annulation : voir down.sql.

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "phoneDigits" TEXT,
ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "priority" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Patient_phoneDigits_idx" ON "Patient"("phoneDigits");


-- Remplissage des champs de recherche pour les dossiers déjà existants (si la base contient des données).
CREATE EXTENSION IF NOT EXISTS unaccent;
UPDATE "Patient" SET "searchName" = lower(unaccent(regexp_replace(trim(concat_ws(' ', "lastName", "postName", "firstName")), '\s+', ' ', 'g')))
  WHERE "searchName" = '';
UPDATE "Patient" SET "phoneDigits" = right(regexp_replace("phone", '\D', '', 'g'), 9)
  WHERE "phone" IS NOT NULL AND length(regexp_replace("phone", '\D', '', 'g')) >= 9;

-- Recherche rapide « contient » sur le nom (index trigramme).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX patient_search_name_trgm ON "Patient" USING gin ("searchName" gin_trgm_ops);

-- Un patient n'a qu'un seul passage ouvert à la fois.
CREATE UNIQUE INDEX visit_one_open_per_patient ON "Visit" ("patientId")
  WHERE "status" IN ('WAITING', 'ORIENTED', 'IN_CONSULTATION', 'ADMITTED');
