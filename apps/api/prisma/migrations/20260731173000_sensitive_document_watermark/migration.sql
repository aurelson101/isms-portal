CREATE TYPE "WatermarkPosition" AS ENUM ('HEADER', 'CENTER', 'FOOTER');

ALTER TABLE "Document"
ADD COLUMN "watermarkPosition" "WatermarkPosition" NOT NULL DEFAULT 'CENTER';
