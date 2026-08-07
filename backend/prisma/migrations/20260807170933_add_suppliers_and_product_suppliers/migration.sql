-- CreateTable
CREATE TABLE "Supplier" (
    "id_supplier" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" VARCHAR(20),
    "email" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id_supplier")
);

-- CreateTable
CREATE TABLE "ProductSupplier" (
    "id_productsupplier" SERIAL NOT NULL,
    "id_product" INTEGER NOT NULL,
    "id_supplier" INTEGER NOT NULL,
    "costPrice" DECIMAL(12,2),
    "leadTime" INTEGER,
    "minOrderQuantity" DECIMAL(12,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSupplier_pkey" PRIMARY KEY ("id_productsupplier")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "Supplier_active_idx" ON "Supplier"("active");

-- CreateIndex
CREATE INDEX "ProductSupplier_id_product_idx" ON "ProductSupplier"("id_product");

-- CreateIndex
CREATE INDEX "ProductSupplier_id_supplier_idx" ON "ProductSupplier"("id_supplier");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupplier_id_product_id_supplier_key" ON "ProductSupplier"("id_product", "id_supplier");

-- AddForeignKey
ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product"("id_product") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_id_supplier_fkey" FOREIGN KEY ("id_supplier") REFERENCES "Supplier"("id_supplier") ON DELETE CASCADE ON UPDATE CASCADE;
