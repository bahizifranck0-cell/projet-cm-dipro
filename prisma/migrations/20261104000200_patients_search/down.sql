-- Annulation de 20261104000200_patients_search.
-- Attention : retire les champs de recherche (recalculables) et les champs priority / cancelReason des passages.
DROP INDEX IF EXISTS visit_one_open_per_patient, patient_search_name_trgm, "Patient_phoneDigits_idx";
ALTER TABLE "Visit" DROP COLUMN IF EXISTS "priority", DROP COLUMN IF EXISTS "cancelReason";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "searchName", DROP COLUMN IF EXISTS "phoneDigits";
