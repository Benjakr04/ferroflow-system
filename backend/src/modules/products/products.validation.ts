import { z } from "zod";

// Debe coincidir exactamente con el enum ProductUnit de schema.prisma
const productUnits = [
  "UNIDAD",
  "DECENA",
  "DOCENA",
  "CAJA",
  "BOLSA",
  "KG",
  "LITRO",
  "METRO",
] as const;

export const createProductSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  description: z.string().optional(),
  baseUnit: z.enum(productUnits),
  stock: z.number().nonnegative().optional(),
  minStock: z.number().nonnegative().optional(),
  id_category: z.number().int().positive(),
});

// .partial() hace que TODOS los campos sean opcionales,
// porque al editar no siempre querés mandar el objeto completo.
export const updateProductSchema = createProductSchema.partial();