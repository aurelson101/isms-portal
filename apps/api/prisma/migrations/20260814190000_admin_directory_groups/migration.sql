CREATE TABLE "AdminDirectoryGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distinguishedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminDirectoryGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminDirectoryGroup_name_key" ON "AdminDirectoryGroup"("name");
CREATE UNIQUE INDEX "AdminDirectoryGroup_distinguishedName_key" ON "AdminDirectoryGroup"("distinguishedName");
CREATE INDEX "AdminDirectoryGroup_active_name_idx" ON "AdminDirectoryGroup"("active", "name");
