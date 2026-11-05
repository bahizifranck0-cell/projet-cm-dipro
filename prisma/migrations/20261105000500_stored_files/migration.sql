-- Fichiers privés stockés en base (mode cloud). Ajout uniquement. Annulation : down.sql

-- CreateTable
CREATE TABLE "StoredFile" (
    "path" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("path")
);

