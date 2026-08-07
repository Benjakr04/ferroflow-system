//backend/src/modules/categories/categories.service.ts
import prisma from "../../config/database";
import type { createCategorySchema, updateCategorySchema } from "./categories.validation";
import type { z } from "zod";
import { Prisma } from "@prisma/client";

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

type CategoryWithRelations = Prisma.CategoryGetPayload<{
  include: {
    parent: true;
    subcategories: true;
    products: true;
  };
}>;

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
 * Oculta el padre si está inactivo y no corresponde mostrarlo.
 * Evita que un usuario sin permisos vea datos de una categoría
 * padre que fue desactivada (soft delete).
 */
function hideInactiveParent<T extends { parent: { active: boolean } | null }>(
  category: T,
  canSeeInactive: boolean
): T {
  if (!canSeeInactive && category.parent && !category.parent.active) {
    return { ...category, parent: null };
  }
  return category;
}

/**
 * Crear una nueva categoría
 *
 * Validaciones:
 * - El nombre debe ser único
 * - Si tiene id_parent, la categoría padre debe existir
 * - No se permite categoría padre de sí misma (validación en updateCategory, aquí no hay ID aún)
 */
export async function createCategory(data: CreateCategoryInput): Promise<CategoryWithRelations> {
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
      products: true,
    },
  });

  return category;
}

/**
 * Obtener todas las categorías activas
 *
 * Si includeInactive es false, solo devuelve categorías activas.
 * Las subcategorías también se filtran por estado activo.
 * Si el padre de una categoría esta inactivo y no corresponde verlo,
 * se oculta (se devuelve como null) para no filtrar datos desactivados.
 */
export async function getAllCategories(includeInactive = false): Promise<CategoryWithRelations[]> {
  const categories = await prisma.category.findMany({
    where: includeInactive ? {} : { active: true },
    include: {
      parent: true,
      subcategories: {
        where: includeInactive ? {} : { active: true },
      },
      products: true,
    },
    orderBy: { name: "asc" },
  });

  return categories.map((category) => hideInactiveParent(category, includeInactive));
}

/**
 * Obtener una categoría específica por ID
 *
 * Para usuarios no-admin, solo devuelve categorías activas.
 * Admin puede ver cualquier categoría.
 * Si el padre esta inactivo y el usuario no es admin, se oculta.
 */
export async function getCategoryById(
  id_category: number,
  userRole?: string
): Promise<CategoryWithRelations | null> {
  const isAdmin = userRole === "ADMIN";

  const category = await prisma.category.findUnique({
    where: { id_category },
    include: {
      parent: true,
      subcategories: {
        where: isAdmin ? {} : { active: true },
      },
      products: true,
    },
  });

  // Si no es admin y la categoría está inactiva, no permitir acceso
  if (category && !category.active && !isAdmin) {
    return null;
  }

  return category ? hideInactiveParent(category, isAdmin) : null;
}

/**
 * Helper: Detectar ciclos indirectos en la cadena de padres
 *
 * Recorre la cadena ancestor y devuelve true si encuentra un ciclo,
 * ya sea porque llega de nuevo a id_category o porque encuentra
 * un ciclo preexistente en la cadena (ej. A -> B -> A) que no
 * involucra directamente a id_category.
 */
async function hasCyclicParent(id_category: number, new_parent_id: number): Promise<boolean> {
  let currentParentId: number | null = new_parent_id;
  const visited = new Set<number>();

  while (currentParentId) {
    if (currentParentId === id_category) {
      return true; // Ciclo detectado contra la categoria que se esta actualizando
    }

    if (visited.has(currentParentId)) {
      return true; // Ciclo preexistente en la cadena de padres
    }

    visited.add(currentParentId);

    const parent: { id_parent: number | null } | null = await prisma.category.findUnique({
      where: { id_category: currentParentId },
      select: { id_parent: true },
    });

    currentParentId = parent?.id_parent ?? null;
  }

  return false; // No hay ciclo
}

/**
 * Actualizar una categoría
 *
 * Validaciones:
 * - El nombre nuevo debe ser único (si cambió)
 * - Si cambia id_parent, la nueva categoría padre debe existir
 * - No se permite crear ciclos directos o indirectos
 *
 * Toda la operacion (lectura, validacion de ciclos y update) corre dentro
 * de una transaccion Serializable. Esto evita que dos requests concurrentes
 * armen un ciclo A <-> B pasando ambas la validacion antes de que la otra
 * confirme su cambio. Si Postgres detecta el conflicto de serializacion
 * (P2034), reintentamos la transaccion completa.
 */
export async function updateCategory(
  id_category: number,
  data: UpdateCategoryInput
): Promise<CategoryWithRelations> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const category = await tx.category.findUnique({
            where: { id_category },
          });

          if (!category) {
            throw new CategoryDomainError("Categoría no encontrada", 404);
          }

          // Validar nombre único (si cambió)
          if (data.name && data.name !== category.name) {
            const existing = await tx.category.findUnique({
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
              // Validar que la categoría padre existe
              const parent = await tx.category.findUnique({
                where: { id_category: data.id_parent },
              });

              if (!parent) {
                throw new CategoryDomainError("Categoría padre no encontrada", 404);
              }

              // Validar que no sea padre de sí mismo (directo)
              if (data.id_parent === id_category) {
                throw new CategoryDomainError(
                  "Una categoría no puede ser su propia categoría padre",
                  400
                );
              }

              // Validar ciclos indirectos (A → B → A), usando el mismo cliente
              // transaccional para que la lectura sea consistente con el update
              const hasCycle = await hasCyclicParentInTx(tx, id_category, data.id_parent);
              if (hasCycle) {
                throw new CategoryDomainError(
                  "Esta asignación crearía un ciclo en la jerarquía de categorías",
                  400
                );
              }
            }
          }

          // Armar objeto de actualización a mano (exactOptionalPropertyTypes)
          const updateData: Record<string, unknown> = {};

          if (data.name !== undefined) updateData.name = data.name;
          if (data.description !== undefined) updateData.description = data.description;
          if (data.id_parent !== undefined) updateData.id_parent = data.id_parent;

          const updated = await tx.category.update({
            where: { id_category },
            data: updateData,
            include: {
              parent: true,
              subcategories: true,
              products: true,
            },
          });

          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      // P2034: conflicto de serializacion detectado por Postgres.
      // Reintentamos la transaccion completa, salvo que ya sea el ultimo intento.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < MAX_RETRIES
      ) {
        continue;
      }
      throw error;
    }
  }

  // Este punto no deberia alcanzarse nunca, pero TypeScript lo requiere
  throw new CategoryDomainError("No se pudo actualizar la categoría, intenta nuevamente", 409);
}

/**
 * Igual que hasCyclicParent pero usando el cliente transaccional (tx)
 * en lugar del cliente global, para que la lectura sea consistente
 * dentro de la transaccion Serializable de updateCategory.
 */
async function hasCyclicParentInTx(
  tx: Prisma.TransactionClient,
  id_category: number,
  new_parent_id: number
): Promise<boolean> {
  let currentParentId: number | null = new_parent_id;
  const visited = new Set<number>();

  while (currentParentId) {
    if (currentParentId === id_category) {
      return true;
    }

    if (visited.has(currentParentId)) {
      return true;
    }

    visited.add(currentParentId);

    const parent: { id_parent: number | null } | null = await tx.category.findUnique({
      where: { id_category: currentParentId },
      select: { id_parent: true },
    });

    currentParentId = parent?.id_parent ?? null;
  }

  return false;
}

/**
 * Desactivar una categoría (soft delete)
 *
 * No se puede desactivar si tiene productos asociados
 */
export async function deactivateCategory(id_category: number): Promise<CategoryWithRelations> {
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
      products: true,
    },
  });

  return deactivated;
}