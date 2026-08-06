//backend/src/modules/orders/orders.controller.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth.middleware";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createOrderSchema, updateOrderSchema } from "./orders.validation";
import {
  OrderDomainError,
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  cancelOrder,
  getCustomerById,
} from "./orders.service";

/**
 * POST /orders
 * 
 * Crear una nueva orden de venta
 * 
 * Roles permitidos: VENDEDOR, CAJERO, ADMIN
 * 
 * Body:
 * {
 *   "id_customer": 1,
 *   "observations": "Cliente desea entrega rápida (opcional)",
 *   "items": [
 *     {
 *       "id_presentation": 5,
 *       "quantity": 10,
 *       "unitPrice": 25.50
 *     }
 *   ]
 * }
 * 
 * Response: 201 Created con datos de la orden
 */
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
    if (error instanceof OrderDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al crear la orden" });
  }
}

/**
 * GET /orders
 * 
 * Listar todas las órdenes con filtros opcionales
 * 
 * Query params:
 * - status: PENDIENTE, ENVIADA, CANCELADA (opcional)
 * - id_customer: número de cliente (opcional)
 * 
 * Ejemplo: GET /orders?status=PENDIENTE&id_customer=1
 * 
 * Response: 200 OK con array de órdenes
 */
export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const id_customer = req.query.id_customer
      ? Number(req.query.id_customer)
      : undefined;

    // Validar status contra el enum permitido
    const validStatuses = ["PENDIENTE", "ENVIADA", "CANCELADA"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status inválido. Valores permitidos: ${validStatuses.join(", ")}`,
      });
    }

    // Validar id_customer como safe integer positivo
    if (id_customer !== undefined) {
      if (!Number.isSafeInteger(id_customer) || id_customer <= 0) {
        return res.status(400).json({ error: "ID de cliente inválido" });
      }
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

/**
 * GET /orders/:id
 * 
 * Obtener una orden específica por ID
 * 
 * Response: 200 OK con datos de la orden, o 404 si no existe
 */
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

/**
 * PUT /orders/:id
 * 
 * Actualizar una orden (solo si está en PENDIENTE)
 * 
 * Roles permitidos: VENDEDOR, CAJERO, ADMIN
 * 
 * Body (todos los campos son opcionales):
 * {
 *   "observations": "nueva observación",
 *   "status": "ENVIADA" (para cambiar de PENDIENTE a ENVIADA)
 * }
 * 
 * Response: 200 OK con datos actualizados
 * Response: 409 Conflict si intenta editar una orden ENVIADA o CANCELADA
 */
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
    // Manejo de errores de dominio (transiciones de estado inválidas)
    if (error instanceof OrderDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
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

/**
 * DELETE /orders/:id
 * 
 * Cancelar una orden (solo si está en PENDIENTE)
 * 
 * Roles permitidos: VENDEDOR, CAJERO, ADMIN
 * 
 * Restricciones:
 * - No se puede cancelar si la orden está ENVIADA
 * - No se puede cancelar si tiene una factura asociada
 * 
 * Response: 204 No Content (éxito)
 * Response: 409 Conflict si intenta cancelar una orden ENVIADA o con factura
 */
export async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const id_order = Number(req.params.id);
    if (!Number.isSafeInteger(id_order) || id_order <= 0) {
      return res.status(400).json({ error: "ID de orden inválido" });
    }

    await cancelOrder(id_order);
    return res.status(204).send();
  } catch (error) {
    // Manejo de errores de dominio (restricciones de negocio)
    if (error instanceof OrderDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Orden no encontrada" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al cancelar la orden" });
  }
}