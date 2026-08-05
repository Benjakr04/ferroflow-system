import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Tipos para el payload del JWT
interface JwtPayload {
  id: number;
  email: string;
  role: "ADMIN" | "USER" | "GUEST";
  iat?: number;
  exp?: number;
}

/**
 * Middleware de autenticación
 * Valida el JWT del header Authorization y asigna req.user
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: "Token no proporcionado" });
      return;
    }

    // Validar y decodificar el JWT
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "tu-secreto-aqui"
    ) as JwtPayload;

    // Asignar el usuario al request ✅
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Token expirado" });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Token inválido" });
      return;
    }
    res.status(500).json({ error: "Error al validar token" });
  }
}

/**
 * Middleware opcional de autenticación
 * No rechaza si no hay token, solo intenta asignarlo si existe
 */
export function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);

    if (token) {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "tu-secreto-aqui"
      ) as JwtPayload;

      req.user = {
        id: decoded.id,
        role: decoded.role,
        email: decoded.email,
      };
    }

    next();
  } catch (error) {
    // Si hay error pero el token es opcional, continuamos
    // (quizás sea una ruta pública)
    console.warn("Error al validar token opcional:", error);
    next();
  }
}

/**
 * Middleware para verificar que el usuario es ADMIN
 * Debe ejecutarse DESPUÉS de authMiddleware
 */
export function adminOnly(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  if (req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Acceso denegado: Se requiere rol ADMIN" });
    return;
  }

  next();
}

/**
 * Extrae el token del header Authorization
 * Soporta formato: "Bearer <token>"
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}

/**
 * Helper para generar un JWT (útil para login)
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET || "tu-secreto-aqui", {
    expiresIn: "24h", // Configurable según necesites
  });
}

/**
 * Función auxiliar para verificar si un usuario tiene un rol específico
 */
export function hasRole(req: Request, requiredRole: string): boolean {
  return req.user?.role === requiredRole;
}