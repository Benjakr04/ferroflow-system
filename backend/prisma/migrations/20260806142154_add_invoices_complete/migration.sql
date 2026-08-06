/*
  Warnings:

  - Added the required column `saleCondition` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ivaAmount` to the `InvoiceItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clientRUC" VARCHAR(15),
ADD COLUMN     "clientType" TEXT,
ADD COLUMN     "emissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "saleCondition" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "ivaAmount" DECIMAL(12,2) NOT NULL;

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_id_customer_idx" ON "Invoice"("id_customer");

-- CreateIndex
CREATE INDEX "Invoice_id_user_idx" ON "Invoice"("id_user");

-- CreateIndex
CREATE INDEX "Invoice_emissionDate_idx" ON "Invoice"("emissionDate");
