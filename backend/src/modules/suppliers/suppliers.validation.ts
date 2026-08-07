//backend/src/modules/suppliers/suppliers.validation.ts
import { z } from "zod";

/**
 * MODULO DE PROVEEDORES (SUPPLIERS)
 * ============================================================================
 *
 * Un proveedor puede estar asociado a varios productos, y un producto puede
 * tener varios proveedores (relacion many-to-many via ProductSupplier).
 *
 * El precio de compra (costPrice) es OPCIONAL a proposito: muchas ferreterias
 * no llevan ese dato al dia, pero cuando lo tienen, sirve para comparar
 * de que proveedor conviene comprar el mismo producto.
 */

export const createSupplierSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(150),
  contactPerson: z.string().max(150).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email("Email invalido").optional(),
  address: z.string().max(300).optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  contactPerson: z.string().max(150).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email("Email invalido").nullable().optional(),
  address: z.string().max(300).nullable().optional(),
});

/**
 * Asociar un producto a un proveedor.
 * Todos los datos comerciales (costPrice, leadTime, minOrderQuantity)
 * son opcionales: el ferretero puede registrar solo "este producto lo
 * compro en este proveedor" sin necesariamente saber el precio todavia.
 */
export const linkProductSupplierSchema = z.object({
  id_product: z.number().int().positive(),
  costPrice: z.number().nonnegative("El precio de compra no puede ser negativo").optional(),
  leadTime: z.number().int().nonnegative("Los dias de entrega no pueden ser negativos").optional(),
  minOrderQuantity: z.number().nonnegative("La cantidad minima no puede ser negativa").optional(),
});

export const updateProductSupplierSchema = z.object({
  costPrice: z.number().nonnegative().nullable().optional(),
  leadTime: z.number().int().nonnegative().nullable().optional(),
  minOrderQuantity: z.number().nonnegative().nullable().optional(),
});