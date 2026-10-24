-- Customer terms and privacy texts now live in code (src/legal/customer-documents.ts)
-- and are no longer editable from the admin panel.

-- DropForeignKey
ALTER TABLE "LegalDocument" DROP CONSTRAINT "LegalDocument_createdById_fkey";

-- DropTable
DROP TABLE "LegalDocument";

-- DropEnum
DROP TYPE "LegalDocKind";
