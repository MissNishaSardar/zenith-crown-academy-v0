-- AlterTable
ALTER TABLE "academic_year" ADD COLUMN "currentGuard" TEXT;

-- Backfill guard for existing CURRENT row, if any
UPDATE "academic_year" SET "currentGuard" = 'CURRENT' WHERE "status" = 'CURRENT';

-- CreateIndex
CREATE UNIQUE INDEX "academic_year_currentGuard_key" ON "academic_year"("currentGuard");
