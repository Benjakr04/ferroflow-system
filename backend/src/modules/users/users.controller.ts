//backend/src/modules/users/users.controller.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth.middleware";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createUserSchema, updateUserSchema } from "./users.validation";
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserByEmail,
} from "./users.service";

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const data = createUserSchema.parse(req.body);

    const existingUser = await getUserByEmail(data.email);
    if (existingUser) {
      return res.status(409).json({ error: "El email ya está registrado" });
    }

    const user = await createUser(data);
    return res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "El email ya está registrado" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al crear el usuario" });
  }
}

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const users = await getAllUsers();
    return res.status(200).json(users);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener los usuarios" });
  }
}

export async function getOne(req: AuthenticatedRequest, res: Response) {
  try {
    const id_user = Number(req.params.id);
    if (!Number.isSafeInteger(id_user) || id_user <= 0) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    const user = await getUserById(id_user);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener el usuario" });
  }
}

export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const id_user = Number(req.params.id);
    if (!Number.isSafeInteger(id_user) || id_user <= 0) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    const data = updateUserSchema.parse(req.body);

    const user = await updateUser(id_user, data);
    return res.status(200).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      if (error.code === "P2002") {
        return res.status(409).json({ error: "El email ya está registrado" });
      }
    }
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar el usuario" });
  }
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const id_user = Number(req.params.id);
    if (!Number.isSafeInteger(id_user) || id_user <= 0) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }

    await deleteUser(id_user);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al eliminar el usuario" });
  }
}