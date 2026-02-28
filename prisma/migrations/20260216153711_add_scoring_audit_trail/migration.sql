-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CheckRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "passed" BOOLEAN,
    "severity" TEXT,
    "optionValue" TEXT,
    "comment" TEXT,
    "classId" TEXT NOT NULL,
    "checkItemId" TEXT NOT NULL,
    "scoredById" TEXT NOT NULL,
    "scoredByRole" TEXT,
    "scoredByName" TEXT,
    "originalScoredById" TEXT,
    "originalScoredByName" TEXT,
    "originalScoredByRole" TEXT,
    "originalPassed" BOOLEAN,
    "originalSeverity" TEXT,
    "originalScoredAt" DATETIME,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedByRole" TEXT,
    "reviewedAt" DATETIME,
    "reviewAction" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CheckRecord_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckRecord_checkItemId_fkey" FOREIGN KEY ("checkItemId") REFERENCES "CheckItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckRecord_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckRecord_originalScoredById_fkey" FOREIGN KEY ("originalScoredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CheckRecord_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CheckRecord" ("checkItemId", "classId", "comment", "createdAt", "date", "id", "optionValue", "passed", "scoredById", "severity", "updatedAt") SELECT "checkItemId", "classId", "comment", "createdAt", "date", "id", "optionValue", "passed", "scoredById", "severity", "updatedAt" FROM "CheckRecord";
DROP TABLE "CheckRecord";
ALTER TABLE "new_CheckRecord" RENAME TO "CheckRecord";
CREATE UNIQUE INDEX "CheckRecord_classId_checkItemId_date_key" ON "CheckRecord"("classId", "checkItemId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
