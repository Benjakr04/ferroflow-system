//backend/src/modules/categories/categories.validation.ts
import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  description: z.string().max(500).optional(),
  id_parent: z.number().int().positive().optional(),
});

// Permitir null para campos nullable (description e id_parent)
export const updateCategorySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  id_parent: z.number().int().positive().nullable().optional(),
});