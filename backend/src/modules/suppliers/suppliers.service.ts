//backend/src/modules/suppliers/suppliers.service.ts
import prisma from "../../config/database";
import type {
  createSupplierSchema,
  updateSupplierSchema,
  linkProductSupplierSchema,
  updateProductSupplierSchema,
} from "./suppliers.validation";
import type { z } from "zod";
import { Prisma } from "@prisma/client";

type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
type LinkProductSupplierInput = z.infer<typeof linkProductSupplierSchema>;
type UpdateProductSupplierInput = z.infer<typeof updateProductSupplierSchema>;

type SupplierWithLinks = Prisma.SupplierGetPayload<{
  include: {
    productSuppliers: {
      include: { product: true };
    };
  };
}>;

/**
 * Clase personalizada para errores de dominio en proveedores
 */
export class SupplierDomainError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "SupplierDomainError";
  }
}

/**
 * Convierte los campos Decimal de Prisma a numeros normales para el JSON
 */
function serializeProductSupplierLink(link: any) {
  return {
    ...link,
    costPrice: link.costPrice !== null ? Number(link.costPrice) : null,
    minOrderQuantity: link.minOrderQuantity !== null ? Number(link.minOrderQuantity) : null,
  };
}

function serializeSupplier(supplier: any) {
  return {
    ...supplier,
    productSuppliers: supplier.productSuppliers?.map(serializeProductSupplierLink) ?? [],
  };
}

/**
 * Crear un nuevo proveedor
 *
 * Validacion: el nombre debe ser unico
 */
export async function createSupplier(data: CreateSupplierInput) {
  const existing = await prisma.supplier.findUnique({
    where: { name: data.name },
  });

  if (existing) {
    throw new SupplierDomainError(
      `Ya existe un proveedor con el nombre "${data.name}"`,
      409
    );
  }

  const supplier = await prisma.supplier.create({
    data: {
      name: data.name,
      contactPerson: data.contactPerson ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
    },
  });

  return supplier;
}

/**
 * Obtener todos los proveedores
 *
 * includeInactive: solo ADMIN puede ver proveedores desactivados
 */
export async function getAllSuppliers(includeInactive = false) {
  const suppliers = await prisma.supplier.findMany({
    where: includeInactive ? {} : { active: true },
    include: {
      productSuppliers: {
        include: { product: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return suppliers.map(serializeSupplier);
}

/**
 * Obtener un proveedor especifico por ID
 *
 * Usuarios no-admin no pueden ver proveedores inactivos
 */
export async function getSupplierById(id_supplier: number, userRole?: string) {
  const isAdmin = userRole === "ADMIN";

  const supplier = await prisma.supplier.findUnique({
    where: { id_supplier },
    include: {
      productSuppliers: {
        include: { product: true },
      },
    },
  });

  if (!supplier) {
    return null;
  }

  if (!supplier.active && !isAdmin) {
    return null;
  }

  return serializeSupplier(supplier);
}

/**
 * Actualizar un proveedor
 *
 * Validacion: si cambia el nombre, debe seguir siendo unico.
 *
 * La comprobacion previa (findUnique por nombre) no evita una escritura
 * concurrente: si dos requests intentan poner el mismo nombre casi al
 * mismo tiempo, ambas pueden pasar la validacion antes de que la otra
 * confirme su update. Por eso el update en si tambien queda protegido
 * contra P2002 (constraint unique violado a nivel de base de datos).
 */
export async function updateSupplier(id_supplier: number, data: UpdateSupplierInput) {
  const supplier = await prisma.supplier.findUnique({
    where: { id_supplier },
  });

  if (!supplier) {
    throw new SupplierDomainError("Proveedor no encontrado", 404);
  }

  if (data.name && data.name !== supplier.name) {
    const existing = await prisma.supplier.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new SupplierDomainError(
        `Ya existe un proveedor con el nombre "${data.name}"`,
        409
      );
    }
  }

  // Armar objeto de actualizacion a mano (exactOptionalPropertyTypes)
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.contactPerson !== undefined) updateData.contactPerson = data.contactPerson;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.address !== undefined) updateData.address = data.address;

  try {
    const updated = await prisma.supplier.update({
      where: { id_supplier },
      data: updateData,
      include: {
        productSuppliers: {
          include: { product: true },
        },
      },
    });

    return serializeSupplier(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SupplierDomainError(
        `Ya existe un proveedor con el nombre "${data.name}"`,
        409
      );
    }
    throw error;
  }
}

/**
 * Desactivar un proveedor (soft delete)
 *
 * Al desactivar el proveedor, tambien se desactivan sus asociaciones
 * con productos (ProductSupplier), para que dejen de aparecer como
 * opcion de compra activa. El historial de precios queda intacto.
 */
export async function deactivateSupplier(id_supplier: number) {
  const supplier = await prisma.supplier.findUnique({
    where: { id_supplier },
  });

  if (!supplier) {
    throw new SupplierDomainError("Proveedor no encontrado", 404);
  }

  const deactivated = await prisma.$transaction(async (tx) => {
    await tx.productSupplier.updateMany({
      where: { id_supplier },
      data: { active: false },
    });

    return tx.supplier.update({
      where: { id_supplier },
      data: { active: false },
      include: {
        productSuppliers: {
          include: { product: true },
        },
      },
    });
  });

  return serializeSupplier(deactivated);
}

/**
 * Asociar un producto a un proveedor, opcionalmente con precio de compra
 *
 * Validaciones:
 * - El proveedor debe existir y estar activo (no se agregan productos
 *   nuevos a un proveedor desactivado)
 * - El producto debe existir
 * - No puede existir ya una asociacion entre ese producto y ese proveedor
 *   (para eso esta updateProductSupplierLink)
 */
export async function linkProductToSupplier(
  id_supplier: number,
  data: LinkProductSupplierInput
) {
  const supplier = await prisma.supplier.findUnique({
    where: { id_supplier },
  });

  if (!supplier) {
    throw new SupplierDomainError("Proveedor no encontrado", 404);
  }

  if (!supplier.active) {
    throw new SupplierDomainError(
      "No se pueden asociar productos a un proveedor desactivado",
      409
    );
  }

  const product = await prisma.product.findUnique({
    where: { id_product: data.id_product },
  });

  if (!product) {
    throw new SupplierDomainError("Producto no encontrado", 404);
  }

  try {
    const link = await prisma.productSupplier.create({
      data: {
        id_supplier,
        id_product: data.id_product,
        costPrice: data.costPrice ?? null,
        leadTime: data.leadTime ?? null,
        minOrderQuantity: data.minOrderQuantity ?? null,
      },
      include: { product: true },
    });

    return serializeProductSupplierLink(link);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SupplierDomainError(
        "Este producto ya esta asociado a este proveedor. Usa la edicion para actualizar sus datos",
        409
      );
    }
    throw error;
  }
}

/**
 * Actualizar los datos comerciales de una asociacion producto-proveedor
 * (precio de compra, tiempo de entrega, cantidad minima)
 */
export async function updateProductSupplierLink(
  id_supplier: number,
  id_product: number,
  data: UpdateProductSupplierInput
) {
  const link = await prisma.productSupplier.findUnique({
    where: { id_product_id_supplier: { id_product, id_supplier } },
  });

  if (!link) {
    throw new SupplierDomainError(
      "No existe una asociacion entre este producto y este proveedor",
      404
    );
  }

  const updateData: Record<string, unknown> = {};

  if (data.costPrice !== undefined) updateData.costPrice = data.costPrice;
  if (data.leadTime !== undefined) updateData.leadTime = data.leadTime;
  if (data.minOrderQuantity !== undefined) updateData.minOrderQuantity = data.minOrderQuantity;

  const updated = await prisma.productSupplier.update({
    where: { id_product_id_supplier: { id_product, id_supplier } },
    data: updateData,
    include: { product: true },
  });

  return serializeProductSupplierLink(updated);
}

/**
 * Quitar la asociacion entre un producto y un proveedor
 */
export async function unlinkProductFromSupplier(id_supplier: number, id_product: number) {
  const link = await prisma.productSupplier.findUnique({
    where: { id_product_id_supplier: { id_product, id_supplier } },
  });

  if (!link) {
    throw new SupplierDomainError(
      "No existe una asociacion entre este producto y este proveedor",
      404
    );
  }

  await prisma.productSupplier.delete({
    where: { id_product_id_supplier: { id_product, id_supplier } },
  });
}

/**
 * Obtener todos los proveedores de un producto especifico,
 * ordenados del mas barato al mas caro.
 *
 * Este es el endpoint clave para el ferretero: le permite ver de un
 * vistazo si conviene seguir comprando donde compra siempre o si hay
 * un proveedor mas barato para el mismo producto.
 *
 * Las asociaciones sin precio registrado (costPrice null) van al final,
 * porque no se pueden comparar.
 */
export async function getSuppliersForProduct(id_product: number) {
  const product = await prisma.product.findUnique({
    where: { id_product },
  });

  if (!product) {
    throw new SupplierDomainError("Producto no encontrado", 404);
  }

  const links = await prisma.productSupplier.findMany({
    where: {
      id_product,
      active: true,
      supplier: { active: true },
    },
    include: { supplier: true },
  });

  const serialized = links.map(serializeProductSupplierLink);

  // Ordenar manualmente: primero los que tienen precio (ascendente),
  // despues los que no tienen precio registrado
  serialized.sort((a, b) => {
    if (a.costPrice === null && b.costPrice === null) return 0;
    if (a.costPrice === null) return 1;
    if (b.costPrice === null) return -1;
    return a.costPrice - b.costPrice;
  });

  return serialized;
}

/**
 * Obtener todos los productos que provee un proveedor especifico
 *
 * Usuarios no-admin no pueden ver los productos de un proveedor
 * desactivado, siguiendo la misma regla que getSupplierById.
 */
export async function getProductsForSupplier(id_supplier: number, userRole?: string) {
  const isAdmin = userRole === "ADMIN";

  const supplier = await prisma.supplier.findUnique({
    where: { id_supplier },
  });

  if (!supplier) {
    throw new SupplierDomainError("Proveedor no encontrado", 404);
  }

  if (!supplier.active && !isAdmin) {
    throw new SupplierDomainError("Proveedor no encontrado", 404);
  }

  const links = await prisma.productSupplier.findMany({
    where: { id_supplier, active: true },
    include: { product: true },
    orderBy: { product: { name: "asc" } },
  });

  return links.map(serializeProductSupplierLink);
}