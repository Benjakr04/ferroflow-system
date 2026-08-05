//backend/src/modules/users/users.validation.ts
import { z } from "zod";

const userRoles = ["VENDEDOR", "CAJERO", "ADMIN", "CLIENTE"] as const;
const userStatuses = ["ACTIVO", "INACTIVO", "SUSPENDIDO"] as const;

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().min(2),
  role: z.enum(userRoles).optional(),
  phone: z.string().max(20).optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).optional(),
  role: z.enum(userRoles).optional(),
  phone: z.string().max(20).optional(),
  status: z.enum(userStatuses).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});