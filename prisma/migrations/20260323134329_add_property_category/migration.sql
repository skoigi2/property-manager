-- CreateEnum
CREATE TYPE "PropertyCategory" AS ENUM ('RESIDENTIAL', 'OFFICE', 'INDUSTRIAL', 'RETAIL', 'MIXED_USE', 'OTHER');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "category" "PropertyCategory",
ADD COLUMN     "categoryOther" TEXT;
