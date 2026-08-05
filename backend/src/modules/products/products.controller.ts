import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createProductSchema, updateProductSchema } from "./products.validation";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deactivateProduct,
  findCategoryById,
} from "./products.service";
import type { AuthenticatedRequest } from "../auth/auth.middleware";

export async function create(req: Request, res: Response) {
  try {
    const data = createProductSchema.parse(req.body);

    const category = await findCategoryById(data.id_category);
    if (!category) {
      return res.status(404).json({ error: "La categoría indicada no existe" });
    }

    const product = await createProduct(data);
    return res.status(201).json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return res.status(409).json({ error: "Ya existe un producto con ese código" });
      }
      if (error.code === "P2003") {
        return res.status(404).json({ error: "La categoría indicada no existe" });
      }
    }
    console.error(error);
    return res.status(500).json({ error: "Error al crear el producto" });
  }
}

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    // Solo ADMIN puede ver productos inactivos
    const includeInactive = req.user?.role === "ADMIN" && req.query.includeInactive === "true";
    const products = await getAllProducts(includeInactive);
    return res.status(200).json(products);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener los productos" });
  }
}

export async function getOne(req: Request, res: Response) {
  try {
    const id_product = Number(req.params.id);
    if (!Number.isSafeInteger(id_product) || id_product <= 0) {
      return res.status(400).json({ error: "ID de producto inválido" });
    }

    const product = await getProductById(id_product);
    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener el producto" });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id_product = Number(req.params.id);
    if (!Number.isSafeInteger(id_product) || id_product <= 0) {
      return res.status(400).json({ error: "ID de producto inválido" });
    }

    const data = updateProductSchema.parse(req.body);
    
    if (data.id_category !== undefined) {
      const category = await findCategoryById(data.id_category);
      if (!category) {
        return res.status(404).json({ error: "La categoría indicada no existe" });
      }
    }

    const product = await updateProduct(id_product, data);
    return res.status(200).json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return res.status(404).json({ error: "Producto no encontrado" });
      }
      if (error.code === "P2002") {
        return res.status(409).json({ error: "Ya existe un producto con ese código" });
      }
    }
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar el producto" });
  }
}
export async function remove(req: Request, res: Response) {
  try {
    const id_product = Number(req.params.id);
    if (!Number.isSafeInteger(id_product) || id_product <= 0) {
      return res.status(400).json({ error: "ID de producto inválido" });
    }

    await deactivateProduct(id_product);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al eliminar el producto" });
  }
}