import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./auth.service";
import prisma from "../../config/database";

// Extendemos el tipo Request de Express para poder guardar el usuario decodificado
export interface AuthenticatedRequest extends Request {
  user?: {
    id_user: number;
    role: string;
  };
}

// Middleware 1: verifica que venga un token válido Y que el usuario esté activo
export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization; // formato esperado: "Bearer <token>"

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }

  // Verificar que el usuario siga activo (previene que usuarios suspendidos usen tokens viejos)
  const user = await prisma.user.findUnique({
    where: { id_user: decoded.id_user },
    select: { status: true },
  });

  if (!user || user.status !== "ACTIVO") {
    return res.status(401).json({ error: "Usuario inactivo o suspendido" });
  }

  req.user = decoded as { id_user: number; role: string };
  next(); // deja pasar al siguiente middleware/controller
}

// Middleware 2: verifica que el usuario tenga uno de los roles permitidos
// Se usa así: authorize("ADMIN") o authorize("ADMIN", "CAJERO")
export function authorize(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autenticado" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "No tienes permiso para esta acción" });
    }

    next();
  };
}