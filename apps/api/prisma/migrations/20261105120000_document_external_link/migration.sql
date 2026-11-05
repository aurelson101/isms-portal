-- Additive migration: link-only documents with optional thumbnail.
ALTER TABLE "Document" ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "thumbnail" TEXT;
