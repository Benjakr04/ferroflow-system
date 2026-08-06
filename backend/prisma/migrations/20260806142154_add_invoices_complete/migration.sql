/*
  Warnings:

  - Added the required column `saleCondition` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ivaAmount` to the `InvoiceItem` table without a default value. This is not possible if the table is not empty.

*/

BEGIN;

-- Crear secuencia para numeracion atomica de facturas
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1 INCREMENT 1;

-- AlterTable Invoice con backfill desde createdAt
ALTER TABLE "Invoice" 
  ADD COLUMN "clientRUC" VARCHAR(15),
  ADD COLUMN "clientType" TEXT,
  ADD COLUMN "emissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "saleCondition" TEXT NOT NULL DEFAULT 'CONTADO';

-- AlterTable InvoiceItem con default temporal
ALTER TABLE "InvoiceItem" 
  ADD COLUMN "ivaAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Remover los defaults despues de la migracion (ya no son necesarios)
ALTER TABLE "Invoice" ALTER COLUMN "saleCondition" DROP DEFAULT;
ALTER TABLE "InvoiceItem" ALTER COLUMN "ivaAmount" DROP DEFAULT;

-- Crear indices para queries rapidas
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_id_customer_idx" ON "Invoice"("id_customer");
CREATE INDEX "Invoice_id_user_idx" ON "Invoice"("id_user");
CREATE INDEX "Invoice_emissionDate_idx" ON "Invoice"("emissionDate");

COMMIT;