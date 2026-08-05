//backend/src/modules/users/users.service.ts
import prisma from "../../config/database";
import { hashPassword } from "../auth/auth.service";
import type { createUserSchema, updateUserSchema } from "./users.validation";
import type { z } from "zod";

type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;

export async function createUser(data: CreateUserInput) {
  const password_hash = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password_hash,
      name: data.name,
      role: data.role ?? "VENDEDOR",
      phone: data.phone ?? null,
    },
    select: {
      id_user: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      status: true,
      createdAt: true,
    },
  });

  return user;
}

export async function getAllUsers() {
  const users = await prisma.user.findMany({
    select: {
      id_user: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });

  return users;
}

export async function getUserById(id_user: number) {
  const user = await prisma.user.findUnique({
    where: { id_user },
    select: {
      id_user: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
}

export async function updateUser(id_user: number, data: UpdateUserInput) {
  // Armamos el objeto a mano, agregando solo los campos que realmente vinieron.
  const updateData: Record<string, unknown> = {};

  if (data.email !== undefined) updateData.email = data.email;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.phone !== undefined) updateData.phone = data.phone ?? null;
  if (data.status !== undefined) updateData.status = data.status;

  const user = await prisma.user.update({
    where: { id_user },
    data: updateData,
    select: {
      id_user: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      status: true,
      updatedAt: true,
    },
  });

  return user;
}

export async function deleteUser(id_user: number) {
  // Soft delete: marcar como inactivo en lugar de borrar
  await prisma.user.update({
    where: { id_user },
    data: { status: "INACTIVO" },
  });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id_user: true,
      email: true,
      password_hash: true,
      name: true,
      role: true,
      phone: true,
      status: true,
    },
  });
}