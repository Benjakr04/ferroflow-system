//backend/src/modules/categories/categories.service.ts
import prisma from "../../config/database";
import type { createCategorySchema, updateCategorySchema } from "./categories.validation";
import type { z } from "zod";

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * Clase personalizada para errores de dominio en categorías
 */
export class CategoryDomainError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "CategoryDomainError";
  }
}

/**
 * Crear una nueva categoría
 *
 * Validaciones:
 * - El nombre debe ser único
 * - Si tiene id_parent, la categoría padre debe existir
 * - No se permite categoría padre de sí misma (circular reference)
 */
export async function createCategory(data: CreateCategoryInput) {
  // Validar que no existe otra categoría con el mismo nombre
  const existing = await prisma.category.findUnique({
    where: { name: data.name },
  });

  if (existing) {
    throw new CategoryDomainError(
      `Ya existe una categoría con el nombre "${data.name}"`,
      409
    );
  }

  // Si tiene id_parent, validar que existe
  if (data.id_parent) {
    const parent = await prisma.category.findUnique({
      where: { id_category: data.id_parent },
    });

    if (!parent) {
      throw new CategoryDomainError("Categoría padre no encontrada", 404);
    }

    // No se puede ser padre de sí mismo
    if (data.id_parent === data.id_parent) {
      throw new CategoryDomainError(
        "Una categoría no puede ser su propia categoría padre",
        400
      );
    }
  }

  const category = await prisma.category.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      id_parent: data.id_parent ?? null,
    },
    include: {
      parent: true,
      subcategories: true,
    },
  });

  return category;
}

/**
 * Obtener todas las categorías activas
 */
export async function getAllCategories(includeInactive = false) {
  const categories = await prisma.category.findMany({
    where: includeInactive ? {} : { active: true },
    include: {
      parent: true,
      subcategories: true,
      products: true,
    },
    orderBy: { name: "asc" },
  });

  return categories;
}

/**
 * Obtener una categoría específica por ID
 */
export async function getCategoryById(id_category: number) {
  const category = await prisma.category.findUnique({
    where: { id_category },
    include: {
      parent: true,
      subcategories: true,
      products: true,
    },
  });

  return category;
}

/**
 * Actualizar una categoría
 *
 * Validaciones:
 * - El nombre nuevo debe ser único (si cambió)
 * - Si cambia id_parent, la nueva categoría padre debe existir
 */
export async function updateCategory(
  id_category: number,
  data: UpdateCategoryInput
) {
  const category = await prisma.category.findUnique({
    where: { id_category },
  });

  if (!category) {
    throw new CategoryDomainError("Categoría no encontrada", 404);
  }

  // Validar nombre único (si cambió)
  if (data.name && data.name !== category.name) {
    const existing = await prisma.category.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new CategoryDomainError(
        `Ya existe una categoría con el nombre "${data.name}"`,
        409
      );
    }
  }

  // Validar id_parent (si cambió)
  if (data.id_parent !== undefined && data.id_parent !== category.id_parent) {
    if (data.id_parent) {
      const parent = await prisma.category.findUnique({
        where: { id_category: data.id_parent },
      });

      if (!parent) {
        throw new CategoryDomainError("Categoría padre no encontrada", 404);
      }

      // No se puede ser padre de sí mismo
      if (data.id_parent === id_category) {
        throw new CategoryDomainError(
          "Una categoría no puede ser su propia categoría padre",
          400
        );
      }
    }
  }

  // Armar objeto de actualización a mano (exactOptionalPropertyTypes)
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description ?? null;
  if (data.id_parent !== undefined) updateData.id_parent = data.id_parent ?? null;

  const updated = await prisma.category.update({
    where: { id_category },
    data: updateData,
    include: {
      parent: true,
      subcategories: true,
      products: true,
    },
  });

  return updated;
}

/**
 * Desactivar una categoría (soft delete)
 *
 * No se puede desactivar si tiene productos asociados
 */
export async function deactivateCategory(id_category: number) {
  const category = await prisma.category.findUnique({
    where: { id_category },
    include: { products: true },
  });

  if (!category) {
    throw new CategoryDomainError("Categoría no encontrada", 404);
  }

  // No desactivar si tiene productos
  if (category.products.length > 0) {
    throw new CategoryDomainError(
      `No se puede desactivar una categoría que tiene ${category.products.length} productos asociados`,
      409
    );
  }

  const deactivated = await prisma.category.update({
    where: { id_category },
    data: { active: false },
    include: {
      parent: true,
      subcategories: true,
    },
  });

  return deactivated;
}