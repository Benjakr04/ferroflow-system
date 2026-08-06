//backend/src/modules/orders/orders.service.ts
import prisma from "../../config/database";
import type { createOrderSchema, updateOrderSchema } from "./orders.validation";
import type { z } from "zod";

type CreateOrderInput = z.infer<typeof createOrderSchema>;
type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

function serializeOrder(order: any) {
  return {
    ...order,
    items: order.items?.map((item: any) => ({
      ...item,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    })) || [],
  };
}

export async function createOrder(id_user: number, data: CreateOrderInput) {
  // Verificar que el cliente exista
  const customer = await prisma.customer.findUnique({
    where: { id_customer: data.id_customer },
  });

  if (!customer) {
    throw new Error("Cliente no encontrado");
  }

  // Verificar que todas las presentaciones existan y tengan stock
  const presentations = await prisma.productPresentation.findMany({
    where: {
      id_presentation: {
        in: data.items.map((item) => item.id_presentation),
      },
    },
    include: { product: true },
  });

  if (presentations.length !== data.items.length) {
    throw new Error("Una o más presentaciones no existen");
  }

  // Crear la orden con sus items
  const order = await prisma.order.create({
    data: {
      id_customer: data.id_customer,
      id_user,
      observations: data.observations ?? null,
      items: {
        create: data.items.map((item) => {
          const presentation = presentations.find(
            (p) => p.id_presentation === item.id_presentation
          );
          return {
            id_presentation: item.id_presentation,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
          };
        }),
      },
    },
    include: {
      customer: true,
      user: true,
      items: {
        include: {
          presentation: {
            include: { product: true },
          },
        },
      },
    },
  });

  return serializeOrder(order);
}

export async function getAllOrders(filters?: { status?: string; id_customer?: number }) {
  const orders = await prisma.order.findMany({
    where: {
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.id_customer && { id_customer: filters.id_customer }),
    },
    include: {
      customer: true,
      user: true,
      items: {
        include: {
          presentation: {
            include: { product: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map(serializeOrder);
}

export async function getOrderById(id_order: number) {
  const order = await prisma.order.findUnique({
    where: { id_order },
    include: {
      customer: true,
      user: true,
      items: {
        include: {
          presentation: {
            include: { product: true },
          },
        },
      },
    },
  });

  return order ? serializeOrder(order) : null;
}

export async function updateOrder(id_order: number, data: UpdateOrderInput) {
  const updateData: Record<string, unknown> = {};

  if (data.observations !== undefined) updateData.observations = data.observations;
  if (data.status !== undefined) updateData.status = data.status;

  const order = await prisma.order.update({
    where: { id_order },
    data: updateData,
    include: {
      customer: true,
      user: true,
      items: {
        include: {
          presentation: {
            include: { product: true },
          },
        },
      },
    },
  });

  return serializeOrder(order);
}

export async function cancelOrder(id_order: number) {
  const order = await prisma.order.update({
    where: { id_order },
    data: { status: "CANCELADA" },
    include: {
      customer: true,
      user: true,
      items: {
        include: {
          presentation: {
            include: { product: true },
          },
        },
      },
    },
  });

  return serializeOrder(order);
}

export async function getCustomerById(id_customer: number) {
  return prisma.customer.findUnique({
    where: { id_customer },
  });
}