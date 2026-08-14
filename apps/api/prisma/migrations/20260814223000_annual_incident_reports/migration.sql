CREATE TABLE "AnnualIncidentReport" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "totalIncidents" INTEGER NOT NULL,
    "criticalIncidents" INTEGER NOT NULL,
    "resolvedIncidents" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "lessonsLearned" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnnualIncidentReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnnualIncidentReport_counts_check" CHECK (
        "totalIncidents" >= 0 AND
        "criticalIncidents" >= 0 AND
        "resolvedIncidents" >= 0 AND
        "criticalIncidents" <= "totalIncidents" AND
        "resolvedIncidents" <= "totalIncidents"
    ),
    CONSTRAINT "AnnualIncidentReport_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED'))
);

CREATE UNIQUE INDEX "AnnualIncidentReport_year_key" ON "AnnualIncidentReport"("year");
CREATE INDEX "AnnualIncidentReport_status_year_idx" ON "AnnualIncidentReport"("status", "year");
