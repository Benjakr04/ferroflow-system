//backend/src/modules/orders/orders.service.ts
import prisma from "../../config/database";
import type { createOrderSchema, updateOrderSchema } from "./orders.validation";
import type { z } from "zod";

type CreateOrderInput = z.infer<typeof createOrderSchema>;
type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/**
 * Clase personalizada para errores de dominio en órdenes.
 * Permite que el controller mapee automáticamente el error a un HTTP status code.
 */
export class OrderDomainError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "OrderDomainError";
  }
}

/**
 * Convierte Decimal de Prisma a números y arrays de items
 */
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

/**
 * Crear una nueva orden de venta
 * 
 * Flujo:
 * 1. Verifica que el cliente exista
 * 2. Verifica que todas las presentaciones solicitadas existan
 * 3. Valida que hay stock suficiente para TODOS los items
 * 4. Crea la orden con sus items (estado = PENDIENTE)
 * 
 * NOTA: El stock no se descuenta aquí (solo se reserva mentalmente).
 * El descuento real ocurre cuando se crea la factura basada en esta orden.
 */
export async function createOrder(id_user: number, data: CreateOrderInput) {
  // Verificar que el cliente exista
  const customer = await prisma.customer.findUnique({
    where: { id_customer: data.id_customer },
  });

  if (!customer) {
    throw new OrderDomainError("Cliente no encontrado", 404);
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
    throw new OrderDomainError("Una o más presentaciones no existen", 404);
  }

  // Validar que hay stock suficiente ANTES de crear la orden
  for (const item of data.items) {
    const presentation = presentations.find(
      (p) => p.id_presentation === item.id_presentation
    );
    if (!presentation) continue;

    // Calcular cuánto stock se necesita en unidades base
    const neededStock = item.quantity * Number(presentation.conversionRate);
    const currentStock = Number(presentation.product.stock);

    if (currentStock < neededStock) {
      throw new OrderDomainError(
        `Stock insuficiente para ${presentation.product.name}. ` +
        `Disponible: ${currentStock}, Necesario: ${neededStock}`,
        409
      );
    }
  }

  // Si llegamos aquí, hay stock suficiente para TODOS los items
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

/**
 * Obtener todas las órdenes con filtros opcionales
 * 
 * Filtros disponibles:
 * - status: PENDIENTE, ENVIADA, CANCELADA
 * - id_customer: filtra por cliente específico
 */
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

/**
 * Obtener una orden específica por ID
 */
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

/**
 * Actualizar una orden
 * 
 * Restricciones:
 * - No se puede editar si la orden está ENVIADA (es inmutable)
 * - No se puede editar si la orden está CANCELADA
 * - Solo se pueden editar observaciones y status (cambiar a ENVIADA)
 */
export async function updateOrder(id_order: number, data: UpdateOrderInput) {
  // Verificar que la orden exista
  const currentOrder = await prisma.order.findUnique({
    where: { id_order },
  });

  if (!currentOrder) {
    throw new OrderDomainError("Orden no encontrada", 404);
  }

  // No se puede editar si ya fue ENVIADA
  if (currentOrder.status === "ENVIADA") {
    throw new OrderDomainError(
      "No se puede editar una orden que ya fue enviada. " +
      "Las órdenes ENVIADAS son inmutables para mantener consistencia con la factura.",
      409
    );
  }

  // No se puede editar si fue CANCELADA
  if (currentOrder.status === "CANCELADA") {
    throw new OrderDomainError(
      "No se puede editar una orden cancelada",
      409
    );
  }

  // Armamos el objeto solo con propiedades que realmente vienen
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

/**
 * Cancelar una orden (soft delete con status = CANCELADA)
 * 
 * Restricciones:
 * - No se puede cancelar si la orden tiene una factura asociada
 * - No se puede cancelar si la orden ya fue ENVIADA
 * - Solo se puede cancelar órdenes en estado PENDIENTE
 */
export async function cancelOrder(id_order: number) {
  // Verificar que la orden exista
  const order = await prisma.order.findUnique({
    where: { id_order },
    include: { invoice: true },
  });

  if (!order) {
    throw new OrderDomainError("Orden no encontrada", 404);
  }

  // No se puede cancelar si ya tiene una factura asociada
  if (order.invoice) {
    throw new OrderDomainError(
      "No se puede cancelar una orden que ya tiene una factura. " +
      "Cancela la factura en su lugar.",
      409
    );
  }

  // No se puede cancelar si ya fue ENVIADA
  if (order.status === "ENVIADA") {
    throw new OrderDomainError(
      "No se puede cancelar una orden que ya fue enviada. " +
      "Si necesitas deshacer esta compra, crea una factura de devolución.",
      400
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

/**
 * Obtener un cliente por ID
 */
export async function getCustomerById(id_customer: number) {
  return prisma.customer.findUnique({
    where: { id_customer },
  });
}