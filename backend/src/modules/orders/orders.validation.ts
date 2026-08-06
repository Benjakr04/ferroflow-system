//backend/src/modules/orders/orders.validation.ts
import { z } from "zod";

const orderStatuses = ["PENDIENTE", "FACTURADA", "CANCELADA"] as const;

export const createOrderSchema = z.object({
  id_customer: z.number().int().positive(),
  observations: z.string().max(500).optional(),
  items: z.array(
    z.object({
      id_presentation: z.number().int().positive(),
      quantity: z.number().positive(),
      unitPrice: z.number().positive(),
    })
  ).min(1, "La orden debe tener al menos 1 item"),
});

export const updateOrderSchema = z.object({
  observations: z.string().max(500).optional(),
  status: z.enum(orderStatuses).optional(),
});