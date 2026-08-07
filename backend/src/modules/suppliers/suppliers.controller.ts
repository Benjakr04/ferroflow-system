//backend/src/modules/suppliers/suppliers.controller.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth.middleware";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  createSupplierSchema,
  updateSupplierSchema,
  linkProductSupplierSchema,
  updateProductSupplierSchema,
} from "./suppliers.validation";
import {
  SupplierDomainError,
  createSupplier,
  getAllSuppliers,
  getSupplierById,
  updateSupplier,
  deactivateSupplier,
  linkProductToSupplier,
  updateProductSupplierLink,
  unlinkProductFromSupplier,
  getSuppliersForProduct,
  getProductsForSupplier,
} from "./suppliers.service";

// Mismo limite que en suppliers.validation.ts: columnas Int de Postgres
const POSTGRES_INT_MAX = 2147483647;

/**
 * Convierte un parametro de ruta a un ID numerico valido.
 *
 * Express tipa req.params[key] como string | string[] (por rutas con
 * comodines tipo "/:id+"), aunque en la practica para nuestras rutas
 * siempre llega un string simple. Este helper cubre ambos casos:
 * si llegara un array, toma el primer valor.
 *
 * Ademas rechaza IDs mayores al maximo de INTEGER en Postgres, para
 * no dejar pasar numeros que rompan la query contra la base.
 */
function parsePositiveId(raw: string | string[] | undefined): number | null {
  if (raw === undefined) {
    return null;
  }

  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) {
    return null;
  }

  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > POSTGRES_INT_MAX) {
    return null;
  }

  return id;
}

/**
 * POST /suppliers
 * Roles permitidos: ADMIN
 */
export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const data = createSupplierSchema.parse(req.body);
    const supplier = await createSupplier(data);
    return res.status(201).json(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof SupplierDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un proveedor con ese nombre" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al crear el proveedor" });
  }
}

/**
 * GET /suppliers
 */
export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const includeInactive = req.query.includeInactive === "true" && req.user?.role === "ADMIN";
    const suppliers = await getAllSuppliers(includeInactive);
    return res.status(200).json(suppliers);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener los proveedores" });
  }
}

/**
 * GET /suppliers/:id
 */
export async function getOne(req: AuthenticatedRequest, res: Response) {
  try {
    const id_supplier = parsePositiveId(req.params.id);
    if (id_supplier === null) {
      return res.status(400).json({ error: "ID de proveedor invalido" });
    }

    const supplier = await getSupplierById(id_supplier, req.user?.role);
    if (!supplier) {
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }

    return res.status(200).json(supplier);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener el proveedor" });
  }
}

/**
 * PUT /suppliers/:id
 * Roles permitidos: ADMIN
 */
export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const id_supplier = parsePositiveId(req.params.id);
    if (id_supplier === null) {
      return res.status(400).json({ error: "ID de proveedor invalido" });
    }

    const data = updateSupplierSchema.parse(req.body);
    const supplier = await updateSupplier(id_supplier, data);
    return res.status(200).json(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof SupplierDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar el proveedor" });
  }
}

/**
 * DELETE /suppliers/:id
 * Roles permitidos: ADMIN
 */
export async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const id_supplier = parsePositiveId(req.params.id);
    if (id_supplier === null) {
      return res.status(400).json({ error: "ID de proveedor invalido" });
    }

    await deactivateSupplier(id_supplier);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof SupplierDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al desactivar el proveedor" });
  }
}

/**
 * POST /suppliers/:id/products
 * Roles permitidos: ADMIN
 *
 * Body: { "id_product": 1, "costPrice": 15000 (opcional), "leadTime": 3 (opcional), "minOrderQuantity": 10 (opcional) }
 */
export async function linkProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const id_supplier = parsePositiveId(req.params.id);
    if (id_supplier === null) {
      return res.status(400).json({ error: "ID de proveedor invalido" });
    }

    const data = linkProductSupplierSchema.parse(req.body);
    const link = await linkProductToSupplier(id_supplier, data);
    return res.status(201).json(link);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof SupplierDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al asociar el producto al proveedor" });
  }
}

/**
 * GET /suppliers/:id/products
 * Lista los productos que provee un proveedor especifico
 */
export async function listProductsForSupplier(req: AuthenticatedRequest, res: Response) {
  try {
    const id_supplier = parsePositiveId(req.params.id);
    if (id_supplier === null) {
      return res.status(400).json({ error: "ID de proveedor invalido" });
    }

    const products = await getProductsForSupplier(id_supplier, req.user?.role);
    return res.status(200).json(products);
  } catch (error) {
    if (error instanceof SupplierDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al obtener los productos del proveedor" });
  }
}

/**
 * PUT /suppliers/:id/products/:id_product
 * Roles permitidos: ADMIN
 *
 * Body: { "costPrice": 15000, "leadTime": 3, "minOrderQuantity": 10 } (todos opcionales, aceptan null)
 */
export async function updateLink(req: AuthenticatedRequest, res: Response) {
  try {
    const id_supplier = parsePositiveId(req.params.id);
    const id_product = parsePositiveId(req.params.id_product);
    if (id_supplier === null || id_product === null) {
      return res.status(400).json({ error: "ID invalido" });
    }

    const data = updateProductSupplierSchema.parse(req.body);
    const link = await updateProductSupplierLink(id_supplier, id_product, data);
    return res.status(200).json(link);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof SupplierDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar la asociacion" });
  }
}

/**
 * DELETE /suppliers/:id/products/:id_product
 * Roles permitidos: ADMIN
 */
export async function unlinkProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const id_supplier = parsePositiveId(req.params.id);
    const id_product = parsePositiveId(req.params.id_product);
    if (id_supplier === null || id_product === null) {
      return res.status(400).json({ error: "ID invalido" });
    }

    await unlinkProductFromSupplier(id_supplier, id_product);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof SupplierDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al desasociar el producto" });
  }
}

/**
 * GET /suppliers/by-product/:id_product
 *
 * Endpoint clave: lista los proveedores de un producto ordenados
 * de mas barato a mas caro, para que el ferretero pueda comparar.
 */
export async function listSuppliersForProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const id_product = parsePositiveId(req.params.id_product);
    if (id_product === null) {
      return res.status(400).json({ error: "ID de producto invalido" });
    }

    const suppliers = await getSuppliersForProduct(id_product);
    return res.status(200).json(suppliers);
  } catch (error) {
    if (error instanceof SupplierDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al obtener los proveedores del producto" });
  }
}