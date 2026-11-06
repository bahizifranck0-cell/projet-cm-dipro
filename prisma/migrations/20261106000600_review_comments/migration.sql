-- Mode revue : commentaires posés sur les éléments de l'interface. Ajout uniquement. Annulation : down.sql

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "path" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "elementTag" TEXT NOT NULL,
    "elementText" TEXT NOT NULL,
    "elementHtml" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "viewport" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'nouveau',
    "reply" TEXT,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "commitSha" TEXT,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewComment_path_idx" ON "ReviewComment"("path");

-- CreateIndex
CREATE INDEX "ReviewComment_status_idx" ON "ReviewComment"("status");
