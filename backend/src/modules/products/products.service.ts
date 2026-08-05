import prisma from "../../config/database";
import type { createProductSchema, updateProductSchema } from "./products.validation";
import type { z } from "zod";

type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;

function serializeProduct(product: any) {
  return {
    ...product,
    stock: Number(product.stock),
    minStock: Number(product.minStock),
  };
}

export async function findCategoryById(id_category: number) {
  return prisma.category.findUnique({ where: { id_category } });
}

export async function createProduct(data: CreateProductInput) {
  const product = await prisma.product.create({
    data: {
      code: data.code ?? null,
      name: data.name,
      description: data.description ?? null,
      baseUnit: data.baseUnit,
      stock: data.stock ?? 0,
      minStock: data.minStock ?? 0,
      id_category: data.id_category,
    },
    include: { category: true },
  });

  return serializeProduct(product);
}

export async function getAllProducts(includeInactive = false) {
  const products = await prisma.product.findMany({
    where: includeInactive ? {} : { active: true },
    include: { category: true, presentations: true },
    orderBy: { name: "asc" },
  });

  return products.map(serializeProduct);
}

export async function getProductById(id_product: number) {
  const product = await prisma.product.findUnique({
    where: { id_product },
    include: { category: true, presentations: true },
  });

  return product ? serializeProduct(product) : null;
}

export async function updateProduct(id_product: number, data: UpdateProductInput) {
  // Armamos el objeto a mano, agregando solo los campos que realmente vinieron.
  // Esto evita mandarle a Prisma propiedades "undefined" sueltas,
  // que es justo lo que exactOptionalPropertyTypes no permite.
  const updateData: Record<string, unknown> = {};

  if (data.code !== undefined) updateData.code = data.code ?? null;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description ?? null;
  if (data.baseUnit !== undefined) updateData.baseUnit = data.baseUnit;
  if (data.stock !== undefined) updateData.stock = data.stock;
  if (data.minStock !== undefined) updateData.minStock = data.minStock;
  if (data.id_category !== undefined) updateData.id_category = data.id_category;

  const product = await prisma.product.update({
    where: { id_product },
    data: updateData,
    include: { category: true },
  });

  return serializeProduct(product);
}

export async function deactivateProduct(id_product: number) {
  const product = await prisma.product.update({
    where: { id_product },
    data: { active: false },
  });

  return serializeProduct(product);
}