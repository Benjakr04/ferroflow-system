//backend/src/modules/categories/categories.controller.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth.middleware";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createCategorySchema, updateCategorySchema } from "./categories.validation";
import {
  CategoryDomainError,
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deactivateCategory,
} from "./categories.service";

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const data = createCategorySchema.parse(req.body);
    const category = await createCategory(data);
    return res.status(201).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof CategoryDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al crear la categoría" });
  }
}

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const includeInactive = req.query.includeInactive === "true" && req.user?.role === "ADMIN";
    const categories = await getAllCategories(includeInactive);
    return res.status(200).json(categories);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener las categorías" });
  }
}

export async function getOne(req: AuthenticatedRequest, res: Response) {
  try {
    const id_category = Number(req.params.id);
    if (!Number.isSafeInteger(id_category) || id_category <= 0) {
      return res.status(400).json({ error: "ID de categoría inválido" });
    }

    const category = await getCategoryById(id_category, req.user?.role);
    if (!category) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    return res.status(200).json(category);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener la categoría" });
  }
}

export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const id_category = Number(req.params.id);
    if (!Number.isSafeInteger(id_category) || id_category <= 0) {
      return res.status(400).json({ error: "ID de categoría inválido" });
    }

    const data = updateCategorySchema.parse(req.body);
    const category = await updateCategory(id_category, data);
    return res.status(200).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof CategoryDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar la categoría" });
  }
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const id_category = Number(req.params.id);
    if (!Number.isSafeInteger(id_category) || id_category <= 0) {
      return res.status(400).json({ error: "ID de categoría inválido" });
    }

    await deactivateCategory(id_category);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof CategoryDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al desactivar la categoría" });
  }
}