-- CreateTable
CREATE TABLE "AppSecret" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSecret_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppSecret_name_isActive_idx" ON "AppSecret"("name", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AppSecret_name_version_key" ON "AppSecret"("name", "version");

-- AddForeignKey
ALTER TABLE "AppSecret" ADD CONSTRAINT "AppSecret_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
