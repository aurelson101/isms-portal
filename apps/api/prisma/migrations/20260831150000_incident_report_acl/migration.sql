CREATE TABLE "AnnualIncidentReportAudience" (
    "reportId" UUID NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "AnnualIncidentReportAudience_pkey" PRIMARY KEY ("reportId", "groupId")
);

CREATE INDEX "AnnualIncidentReportAudience_groupId_idx"
ON "AnnualIncidentReportAudience"("groupId");

ALTER TABLE "AnnualIncidentReportAudience"
ADD CONSTRAINT "AnnualIncidentReportAudience_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "AnnualIncidentReport"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualIncidentReportAudience"
ADD CONSTRAINT "AnnualIncidentReportAudience_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "DirectoryGroup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
