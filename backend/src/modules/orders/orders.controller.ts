//backend/src/modules/orders/orders.controller.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth.middleware";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createOrderSchema, updateOrderSchema } from "./orders.validation";
import {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  cancelOrder,
  getCustomerById,
} from "./orders.service";

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const data = createOrderSchema.parse(req.body);

    // Verificar que el cliente exista
    const customer = await getCustomerById(data.id_customer);
    if (!customer) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const order = await createOrder(req.user!.id_user, data);
    return res.status(201).json(order);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al crear la orden" });
  }
}

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const id_customer = req.query.id_customer
      ? Number(req.query.id_customer)
      : undefined;

    // Validar status contra el enum de verdad
    const validStatuses = ["PENDIENTE", "ENVIADA", "CANCELADA"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Status inválido. Valores permitidos: ${validStatuses.join(", ")}` 
      });
    }

    // Validar id_customer si viene
    if (id_customer && (!Number.isSafeInteger(id_customer) || id_customer <= 0)) {
      return res.status(400).json({ error: "ID de cliente inválido" });
    }

    const filters: { status?: string; id_customer?: number } = {};
    if (status) filters.status = status;
    if (id_customer) filters.id_customer = id_customer;

    const orders = await getAllOrders(filters);
    return res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener las órdenes" });
  }
}

export async function getOne(req: AuthenticatedRequest, res: Response) {
  try {
    const id_order = Number(req.params.id);
    if (!Number.isSafeInteger(id_order) || id_order <= 0) {
      return res.status(400).json({ error: "ID de orden inválido" });
    }

    const order = await getOrderById(id_order);
    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    return res.status(200).json(order);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener la orden" });
  }
}

export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const id_order = Number(req.params.id);
    if (!Number.isSafeInteger(id_order) || id_order <= 0) {
      return res.status(400).json({ error: "ID de orden inválido" });
    }

    const data = updateOrderSchema.parse(req.body);

    const order = await updateOrder(id_order, data);
    return res.status(200).json(order);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return res.status(404).json({ error: "Orden no encontrada" });
      }
    }
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar la orden" });
  }
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const id_order = Number(req.params.id);
    if (!Number.isSafeInteger(id_order) || id_order <= 0) {
      return res.status(400).json({ error: "ID de orden inválido" });
    }

    await cancelOrder(id_order);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Orden no encontrada" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al cancelar la orden" });
  }
}