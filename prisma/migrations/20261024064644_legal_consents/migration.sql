-- CreateEnum
CREATE TYPE "LegalDocKind" AS ENUM ('TERMS', 'PRIVACY');

-- CreateEnum
CREATE TYPE "ConsentContext" AS ENUM ('ADMIN_PLATFORM_TERMS', 'REGISTER', 'BOOKING');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "ip" TEXT;

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "kind" "LegalDocKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "context" "ConsentContext" NOT NULL,
    "document" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "bookingId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_kind_version_key" ON "LegalDocument"("kind", "version");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_document_version_idx" ON "ConsentRecord"("userId", "document", "version");

-- CreateIndex
CREATE INDEX "ConsentRecord_context_acceptedAt_idx" ON "ConsentRecord"("context", "acceptedAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_bookingId_idx" ON "ConsentRecord"("bookingId");

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
