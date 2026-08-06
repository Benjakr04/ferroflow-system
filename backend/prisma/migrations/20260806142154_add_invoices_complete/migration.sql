/*
  Warnings:

  - Added the required column `saleCondition` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ivaAmount` to the `InvoiceItem` table without a default value. This is not possible if the table is not empty.

*/

BEGIN;

-- Crear secuencia para numeracion atomica de facturas
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1 INCREMENT 1;

-- AlterTable Invoice: agregar columnas nuevas (nullable primero)
ALTER TABLE "Invoice" 
  ADD COLUMN "clientRUC" VARCHAR(15),
  ADD COLUMN "clientType" TEXT,
  ADD COLUMN "emissionDate" TIMESTAMP(3),
  ADD COLUMN "saleCondition" TEXT;

-- AlterTable InvoiceItem: agregar ivaAmount (nullable primero)
ALTER TABLE "InvoiceItem" 
  ADD COLUMN "ivaAmount" DECIMAL(12,2);

COMMIT;

-- Backfill con default values (fuera de transaccion para evitar locks prolongados)
UPDATE "Invoice" 
SET 
  "emissionDate" = COALESCE("emissionDate", "createdAt"),
  "saleCondition" = COALESCE("saleCondition", 'CONTADO')
WHERE "emissionDate" IS NULL OR "saleCondition" IS NULL;

UPDATE "InvoiceItem" 
SET "ivaAmount" = COALESCE("ivaAmount", 0)
WHERE "ivaAmount" IS NULL;

-- Agregar CHECK constraints (fast, no scan)
BEGIN;

ALTER TABLE "Invoice" 
  ADD CONSTRAINT "Invoice_emissionDate_not_null_check" 
    CHECK ("emissionDate" IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "Invoice_saleCondition_not_null_check" 
    CHECK ("saleCondition" IS NOT NULL) NOT VALID;

ALTER TABLE "InvoiceItem" 
  ADD CONSTRAINT "InvoiceItem_ivaAmount_not_null_check" 
    CHECK ("ivaAmount" IS NOT NULL) NOT VALID;

COMMIT;

-- Validar constraints (SHARE UPDATE EXCLUSIVE lock, menos restrictivo)
ALTER TABLE "Invoice" 
  VALIDATE CONSTRAINT "Invoice_emissionDate_not_null_check";

ALTER TABLE "Invoice" 
  VALIDATE CONSTRAINT "Invoice_saleCondition_not_null_check";

ALTER TABLE "InvoiceItem" 
  VALIDATE CONSTRAINT "InvoiceItem_ivaAmount_not_null_check";

-- Finalmente, SET NOT NULL (es rapido porque el CHECK ya prueba que no hay NULLs)
BEGIN;

ALTER TABLE "Invoice" 
  ALTER COLUMN "emissionDate" SET NOT NULL,
  ALTER COLUMN "saleCondition" SET NOT NULL,
  DROP CONSTRAINT "Invoice_emissionDate_not_null_check",
  DROP CONSTRAINT "Invoice_saleCondition_not_null_check";

ALTER TABLE "InvoiceItem" 
  ALTER COLUMN "ivaAmount" SET NOT NULL,
  DROP CONSTRAINT "InvoiceItem_ivaAmount_not_null_check";

COMMIT;

-- Crear indices CONCURRENTLY (fuera de transaccion)
CREATE INDEX CONCURRENTLY "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX CONCURRENTLY "Invoice_id_customer_idx" ON "Invoice"("id_customer");
CREATE INDEX CONCURRENTLY "Invoice_id_user_idx" ON "Invoice"("id_user");
CREATE INDEX CONCURRENTLY "Invoice_emissionDate_idx" ON "Invoice"("emissionDate");