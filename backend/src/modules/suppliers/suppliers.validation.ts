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

// Postgres INTEGER va de -2147483648 a 2147483647. Los campos Int de Prisma
// (id_product, leadTime) se guardan en columnas de este tipo, asi que hay
// que rechazar valores mas grandes antes de que lleguen a la base.
const POSTGRES_INT_MAX = 2147483647;

/**
 * Verifica que un numero no tenga mas decimales de los que la columna
 * Decimal de Postgres puede almacenar. Contempla notacion cientifica
 * (ej. 1e-5), que JS permite escribir pero que igual representa una
 * cantidad de decimales real.
 */
function hasMaxDecimalPlaces(value: number, maxPlaces: number): boolean {
  if (!Number.isFinite(value)) return false;

  const str = value.toString();

  if (str.includes("e") || str.includes("E")) {
    const [mantissa, exponentStr] = str.split(/[eE]/);
    const exponent = parseInt(exponentStr, 10);
    const mantissaDecimals = mantissa.includes(".") ? mantissa.split(".")[1].length : 0;
    const actualDecimals = mantissaDecimals - exponent;
    return actualDecimals <= maxPlaces;
  }

  const decimals = str.includes(".") ? str.split(".")[1].length : 0;
  return decimals <= maxPlaces;
}

// costPrice se guarda en Decimal(12, 2): maximo 2 decimales
const costPriceSchema = z
  .number()
  .nonnegative("El precio de compra no puede ser negativo")
  .refine((val) => hasMaxDecimalPlaces(val, 2), {
    message: "El precio de compra admite como maximo 2 decimales",
  });

// minOrderQuantity se guarda en Decimal(12, 3): maximo 3 decimales
const minOrderQuantitySchema = z
  .number()
  .nonnegative("La cantidad minima no puede ser negativa")
  .refine((val) => hasMaxDecimalPlaces(val, 3), {
    message: "La cantidad minima admite como maximo 3 decimales",
  });

const leadTimeSchema = z
  .number()
  .int()
  .nonnegative("Los dias de entrega no pueden ser negativos")
  .max(POSTGRES_INT_MAX, "Los dias de entrega estan fuera de rango");

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
  id_product: z.number().int().positive().max(POSTGRES_INT_MAX, "ID de producto invalido"),
  costPrice: costPriceSchema.optional(),
  leadTime: leadTimeSchema.optional(),
  minOrderQuantity: minOrderQuantitySchema.optional(),
});

export const updateProductSupplierSchema = z.object({
  costPrice: costPriceSchema.nullable().optional(),
  leadTime: leadTimeSchema.nullable().optional(),
  minOrderQuantity: minOrderQuantitySchema.nullable().optional(),
});