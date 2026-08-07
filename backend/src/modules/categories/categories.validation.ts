//backend/src/modules/categories/categories.validation.ts
import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  description: z.string().max(500).optional(),
  id_parent: z.number().int().positive().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();