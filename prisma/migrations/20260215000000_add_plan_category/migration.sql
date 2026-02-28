-- AlterTable: Add planCategory column to CheckItem
ALTER TABLE "CheckItem" ADD COLUMN "planCategory" TEXT;

-- Initialize: Set all existing DAILY fixed items to "rotating" (remove null ambiguity)
UPDATE "CheckItem" SET "planCategory" = 'rotating' WHERE "module" = 'DAILY' AND "isDynamic" = 0 AND "planCategory" IS NULL;
