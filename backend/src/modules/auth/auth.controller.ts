import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../../config/database";
import { hashPassword, comparePasswords, generateToken } from "./auth.service";

// Hash "falso" precalculado, usado solo para igualar el tiempo de respuesta
// cuando el email no existe (evita ataques de timing / user enumeration).
// No corresponde a ninguna contraseña real de ningún usuario.
const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuLQvR3xW8jK9nF2mZ5cY7pE1sA4dG6C";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().min(2),
  phone: z.string().optional(),
});

export async function register(req: Request, res: Response) {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return res.status(409).json({ error: "El email ya está registrado" });
    }

    const password_hash = await hashPassword(data.password);

    // Nota: el rol NO viene del body. Se fuerza VENDEDOR por defecto.
    // Solo un ADMIN debería poder crear usuarios con otro rol (lo hacemos en el módulo "users" más adelante).
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password_hash,
        phone: data.phone ?? null,
      },
    });

    const token = generateToken({ id_user: user.id_user, role: user.role });

    return res.status(201).json({
      user: {
        id_user: user.id_user,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    // Cubre el caso de dos registros simultáneos con el mismo email:
    // ambos pasan el findUnique, pero el segundo create() choca con la
    // constraint @unique de la BD y Prisma lanza P2002.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "El email ya está registrado" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al registrar usuario" });
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function login(req: Request, res: Response) {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    // OJO: el mensaje de error es genérico a propósito.
    // Si dijeras "email no encontrado" vs "contraseña incorrecta",
    // un atacante podría averiguar qué emails están registrados.
    if (!user) {
      // Corremos un compare "falso" igual, para que este camino tarde
      // aproximadamente lo mismo que el camino real de abajo.
      // Si no hiciéramos esto, un atacante podría medir el tiempo de
      // respuesta y deducir qué emails existen aunque el mensaje sea igual.
      await comparePasswords(data.password, DUMMY_HASH);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const passwordMatches = await comparePasswords(data.password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    if (user.status !== "ACTIVO") {
      return res.status(403).json({ error: "Usuario inactivo o suspendido" });
    }

    const token = generateToken({ id_user: user.id_user, role: user.role });

    return res.status(200).json({
      user: {
        id_user: user.id_user,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al iniciar sesión" });
  }
}