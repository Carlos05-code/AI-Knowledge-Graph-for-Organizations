-- KnowledgeGap was never scoped to an organization: GET /gaps and the
-- detect/resolve endpoints all leaked/mutated rows across every org.
-- Added nullable first, backfilled, then made required -- the table may
-- already hold rows (e.g. from prisma/seed.ts) with no organizationId yet.

-- AlterTable
ALTER TABLE "KnowledgeGap" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "KnowledgeGap" ADD COLUMN "entityKey" TEXT;

-- Backfill: pre-existing rows predate org-scoping entirely (the feature
-- never persisted anything in practice -- see ROADMAP.md); assign them to
-- the first organization rather than leave them orphaned.
UPDATE "KnowledgeGap"
SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "organizationId" IS NULL;

-- Make required now that every row has a value.
ALTER TABLE "KnowledgeGap" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeGap_organizationId_category_entityKey_key" ON "KnowledgeGap"("organizationId", "category", "entityKey");

-- CreateIndex
CREATE INDEX "KnowledgeGap_organizationId_resolvedAt_idx" ON "KnowledgeGap"("organizationId", "resolvedAt");
