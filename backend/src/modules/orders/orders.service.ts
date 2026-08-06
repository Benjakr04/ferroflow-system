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

  // Verificar que todas las presentaciones existan
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

  // Validar stock disponible ANTES de crear
  for (const item of data.items) {
    const presentation = presentations.find(
      (p) => p.id_presentation === item.id_presentation
    );
    if (!presentation) continue;

    // Calcular cuánto stock se necesita en unidades base
    const neededStock = item.quantity * Number(presentation.conversionRate);
    const currentStock = Number(presentation.product.stock);

    if (currentStock < neededStock) {
      throw new Error(
        `Stock insuficiente para ${presentation.product.name}. ` +
        `Disponible: ${currentStock}, Necesario: ${neededStock}`
      );
    }
  }

  // Si llegamos aquí, hay stock suficiente para TODOS los items
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
  // Verificar que la orden exista
  const currentOrder = await prisma.order.findUnique({
    where: { id_order },
  });

  if (!currentOrder) {
    throw new Error("Orden no encontrada");
  }

  // No se puede editar si ya fue ENVIADA
  if (currentOrder.status === "ENVIADA") {
    throw new Error(
      "No se puede editar una orden que ya fue enviada. " +
      "Las órdenes ENVIADAS son inmutables para mantener consistencia con la factura."
    );
  }

  // No se puede editar si fue CANCELADA
  if (currentOrder.status === "CANCELADA") {
    throw new Error("No se puede editar una orden cancelada");
  }

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
  // Verificar que la orden exista
  const order = await prisma.order.findUnique({
    where: { id_order },
    include: { invoice: true },
  });

  if (!order) {
    throw new Error("Orden no encontrada");
  }

  // No se puede cancelar si ya tiene una factura asociada
  if (order.invoice) {
    throw new Error(
      "No se puede cancelar una orden que ya tiene una factura. " +
      "Cancela la factura en su lugar."
    );
  }

  // No se puede cancelar si ya fue ENVIADA
  // (una vez enviada, solo se puede hacer una devolución mediante factura de devolución)
  if (order.status === "ENVIADA") {
    throw new Error(
      "No se puede cancelar una orden que ya fue enviada. " +
      "Si necesitas deshacer esta compra, crea una factura de devolución."
    );
  }

  const updatedOrder = await prisma.order.update({
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

  return serializeOrder(updatedOrder);
}

export async function getCustomerById(id_customer: number) {
  return prisma.customer.findUnique({
    where: { id_customer },
  });
}