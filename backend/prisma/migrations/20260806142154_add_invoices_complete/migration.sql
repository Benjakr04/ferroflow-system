/*
  Warnings:

  - Added the required column `saleCondition` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ivaAmount` to the `InvoiceItem` table without a default value. This is not possible if the table is not empty.

*/

BEGIN;

-- Crear secuencia para numeracion atomica de facturas
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1 INCREMENT 1;

-- AlterTable Invoice: agregar columnas nuevas
ALTER TABLE "Invoice" 
  ADD COLUMN "clientRUC" VARCHAR(15),
  ADD COLUMN "clientType" TEXT,
  ADD COLUMN "emissionDate" TIMESTAMP(3),
  ADD COLUMN "saleCondition" TEXT DEFAULT 'CONTADO';

-- Backfill emissionDate desde createdAt para filas existentes
UPDATE "Invoice" 
SET "emissionDate" = "createdAt" 
WHERE "emissionDate" IS NULL;

-- Ahora hacer emissionDate NOT NULL
ALTER TABLE "Invoice" 
  ALTER COLUMN "emissionDate" SET NOT NULL,
  ALTER COLUMN "saleCondition" DROP DEFAULT;

-- AlterTable InvoiceItem: agregar ivaAmount con default temporal
ALTER TABLE "InvoiceItem" 
  ADD COLUMN "ivaAmount" DECIMAL(12,2) DEFAULT 0;

-- Remover el default temporal
ALTER TABLE "InvoiceItem" 
  ALTER COLUMN "ivaAmount" DROP DEFAULT,
  ALTER COLUMN "ivaAmount" SET NOT NULL;

COMMIT;

-- Crear indices FUERA de la transaccion (despues de que se commitee el schema)
-- Esto evita bloqueos durante la migracion
CREATE INDEX CONCURRENTLY "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX CONCURRENTLY "Invoice_id_customer_idx" ON "Invoice"("id_customer");
CREATE INDEX CONCURRENTLY "Invoice_id_user_idx" ON "Invoice"("id_user");
CREATE INDEX CONCURRENTLY "Invoice_emissionDate_idx" ON "Invoice"("emissionDate");