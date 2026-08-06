//backend/src/modules/invoices/invoices.service.ts
import prisma from "../../config/database";
import type { createInvoiceSchema, updateInvoiceStatusSchema } from "./invoices.validation";
import type { z } from "zod";

type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>;

/**
 * Clase personalizada para errores de dominio en facturas.
 * Permite que el controller mapee automaticamente el error a un HTTP status code.
 */
export class InvoiceDomainError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "InvoiceDomainError";
  }
}

// Tasa general de IVA en Paraguay para la mayoria de productos de ferreteria (10%)
const IVA_RATE = 0.10;

/**
 * Convierte los campos Decimal de Prisma a numeros normales para el JSON de respuesta
 */
function serializeInvoice(invoice: any) {
  return {
    ...invoice,
    subtotal: Number(invoice.subtotal),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
    items: invoice.items?.map((item: any) => ({
      ...item,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      ivaAmount: Number(item.ivaAmount),
    })) || [],
  };
}

/**
 * Redondea un numero a 2 decimales (centavos)
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Genera el siguiente numero de factura secuencial de forma atomica
 * Formato: 001-001-0000001 (establecimiento-punto_expedicion-secuencial)
 *
 * Usa una secuencia PostgreSQL para evitar race conditions.
 * Si la secuencia no existe, crea un numero basado en count() como fallback.
 */
async function generateInvoiceNumber(): Promise<string> {
  try {
    // Usar secuencia de PostgreSQL (atomica, thread-safe)
    const result = await prisma.$queryRaw<Array<{ seq: number }>>`
      SELECT NEXTVAL('invoice_number_seq')::int as seq
    `;
    const seq = result[0]?.seq || 1;
    const sequential = seq.toString().padStart(7, "0");
    return `001-001-${sequential}`;
  } catch {
    // Fallback si la secuencia no existe: usar count() (menos seguro pero funciona)
    const count = await prisma.invoice.count();
    const nextNumber = count + 1;
    const sequential = nextNumber.toString().padStart(7, "0");
    return `001-001-${sequential}`;
  }
}

/**
 * Crear una factura a partir de una Orden en estado ENVIADA
 *
 * Flujo:
 * 1. Verifica que la orden exista y este en estado ENVIADA
 * 2. Verifica que la orden no tenga ya una factura asociada
 * 3. Re-valida el stock (puede haber cambiado desde que se creo la orden)
 * 4. Calcula subtotal, IVA (10%) y total a partir de los items de la orden
 *    con redondeo correcto para que la suma de ivaAmounts = tax
 * 5. Genera el numero de factura secuencial
 * 6. Crea la factura + items, y descuenta el stock real de los productos
 *
 * Transaccion atomica con descuento condicional del stock.
 */
export async function createInvoiceFromOrder(id_user: number, data: CreateInvoiceInput) {
  const order = await prisma.order.findUnique({
    where: { id_order: data.id_order },
    include: {
      customer: true,
      invoice: true,
      items: {
        include: {
          presentation: {
            include: { product: true },
          },
        },
      },
    },
  });

  if (!order) {
    throw new InvoiceDomainError("Orden no encontrada", 404);
  }

  if (order.invoice) {
    throw new InvoiceDomainError("Esta orden ya tiene una factura asociada", 409);
  }

  if (order.status !== "ENVIADA") {
    throw new InvoiceDomainError(
      "Solo se pueden facturar ordenes en estado ENVIADA",
      409
    );
  }

  if (order.items.length === 0) {
    throw new InvoiceDomainError("La orden no tiene items para facturar", 400);
  }

  // Re-validar stock: puede haber cambiado desde que se creo la orden
  for (const item of order.items) {
    const neededStock = Number(item.quantity) * Number(item.presentation.conversionRate);
    const currentStock = Number(item.presentation.product.stock);

    if (currentStock < neededStock) {
      throw new InvoiceDomainError(
        `Stock insuficiente para ${item.presentation.product.name}. ` +
        `Disponible: ${currentStock}, Necesario: ${neededStock}`,
        409
      );
    }
  }

  // Calcular subtotal, IVA y total con redondeo correcto
  // Importante: cada ivaAmount se redondea, y la suma de todos ellos ES el tax
  let subtotal = 0;
  let totalIva = 0;

  const itemsDataWithIva = order.items.map((item) => {
    const itemSubtotal = roundToTwoDecimals(Number(item.quantity) * Number(item.unitPrice));
    const itemIva = roundToTwoDecimals(itemSubtotal * IVA_RATE);

    subtotal += itemSubtotal;
    totalIva += itemIva;

    return {
      id_presentation: item.id_presentation,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: itemSubtotal,
      ivaAmount: itemIva,
    };
  });

  // Redondear subtotal total
  subtotal = roundToTwoDecimals(subtotal);

  // El tax es EXACTAMENTE la suma de los ivaAmounts (garantiza auditoría)
  const tax = roundToTwoDecimals(totalIva);
  const total = roundToTwoDecimals(subtotal + tax);

  const invoiceNumber = await generateInvoiceNumber();

  // Datos del cliente copiados al momento de emitir
  const clientRUC = order.customer.documentNumber ?? null;
  const clientType = order.customer.type;

  // Transaccion atomica: crear factura + items + descontar stock CONDICIONAL
  const invoice = await prisma.$transaction(async (tx) => {
    const createdInvoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        saleCondition: data.saleCondition,
        paymentMethod: data.paymentMethod,
        subtotal,
        tax,
        total,
        id_order: order.id_order,
        id_user,
        id_customer: order.id_customer,
        clientRUC,
        clientType,
        items: {
          create: itemsDataWithIva,
        },
      },
      include: {
        customer: true,
        user: true,
        order: true,
        items: {
          include: {
            presentation: {
              include: { product: true },
            },
          },
        },
      },
    });

    // Descontar stock de forma condicional y atomica
    // Solo decrementa si hay stock suficiente disponible AHORA
    for (const item of order.items) {
      const neededStock = Number(item.quantity) * Number(item.presentation.conversionRate);

      // updateMany retorna affected count
      // Si es 0, significa que otro hilo/request ya modifico el stock
      const updated = await tx.product.updateMany({
        where: {
          id_product: item.presentation.id_product,
          stock: { gte: neededStock }, // Solo actualizar si hay stock
        },
        data: {
          stock: {
            decrement: neededStock,
          },
        },
      });

      if (updated.count === 0) {
        throw new InvoiceDomainError(
          `Stock insuficiente para ${item.presentation.product.name}. ` +
          `Puede haber sido comprado concurrentemente.`,
          409
        );
      }
    }

    return createdInvoice;
  });

  return serializeInvoice(invoice);
}

/**
 * Obtener todas las facturas con filtros opcionales
 *
 * Filtros disponibles:
 * - status: DRAFT, PAGADO, CANCELADO, DEVOLUCION
 * - id_customer: filtra por cliente especifico
 */
export async function getAllInvoices(filters?: { status?: string; id_customer?: number }) {
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.id_customer && { id_customer: filters.id_customer }),
    },
    include: {
      customer: true,
      user: true,
      order: true,
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

  return invoices.map(serializeInvoice);
}

/**
 * Obtener una factura especifica por ID
 */
export async function getInvoiceById(id_invoice: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id_invoice },
    include: {
      customer: true,
      user: true,
      order: true,
      items: {
        include: {
          presentation: {
            include: { product: true },
          },
        },
      },
    },
  });

  return invoice ? serializeInvoice(invoice) : null;
}

/**
 * Cambiar el estado de una factura
 *
 * Transiciones permitidas:
 * - DRAFT -> PAGADO       (se confirma el pago; el stock ya se desconto al crear)
 * - DRAFT -> CANCELADO    (se cancela antes de cobrar; se restaura el stock)
 * - PAGADO -> DEVOLUCION  (el cliente devuelve la compra; se restaura el stock)
 *
 * CANCELADO y DEVOLUCION son estados finales: no se puede salir de ahi.
 *
 * Transaccion atomica para evitar restaurar stock dos veces si dos requests
 * concurrentes intentan cambiar el estado simultaneamente.
 */
export async function updateInvoiceStatus(id_invoice: number, data: UpdateInvoiceStatusInput) {
  const invoice = await prisma.invoice.findUnique({
    where: { id_invoice },
    include: {
      items: {
        include: {
          presentation: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new InvoiceDomainError("Factura no encontrada", 404);
  }

  const currentStatus = invoice.status;
  const newStatus = data.status;

  if (currentStatus === "CANCELADO" || currentStatus === "DEVOLUCION") {
    throw new InvoiceDomainError(
      `No se puede modificar una factura en estado ${currentStatus}`,
      409
    );
  }

  const validTransitions: Record<string, string[]> = {
    DRAFT: ["PAGADO", "CANCELADO"],
    PAGADO: ["DEVOLUCION"],
  };

  const allowed = validTransitions[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new InvoiceDomainError(
      `No se puede cambiar de ${currentStatus} a ${newStatus}`,
      409
    );
  }

  const shouldRestoreStock = newStatus === "CANCELADO" || newStatus === "DEVOLUCION";

  // Transaccion atomica: re-validar estado + cambiar + restaurar stock si aplica
  const updatedInvoice = await prisma.$transaction(async (tx) => {
    // Re-leer la factura DENTRO de la transaccion para validar estado actual
    const currentInvoiceInTx = await tx.invoice.findUnique({
      where: { id_invoice },
    });

    if (!currentInvoiceInTx) {
      throw new InvoiceDomainError("Factura no encontrada", 404);
    }

    // Re-validar la transicion dentro de la transaccion
    const currentStatusInTx = currentInvoiceInTx.status;
    const allowedInTx = validTransitions[currentStatusInTx] ?? [];

    if (!allowedInTx.includes(newStatus)) {
      throw new InvoiceDomainError(
        `No se puede cambiar de ${currentStatusInTx} a ${newStatus}`,
        409
      );
    }

    // Si corresponde restaurar stock, hacerlo ANTES de actualizar el status
    if (shouldRestoreStock) {
      for (const item of invoice.items) {
        const restoredStock = Number(item.quantity) * Number(item.presentation.conversionRate);
        await tx.product.update({
          where: { id_product: item.presentation.id_product },
          data: {
            stock: {
              increment: restoredStock,
            },
          },
        });
      }
    }

    // Finalmente, cambiar el status
    return tx.invoice.update({
      where: { id_invoice },
      data: { status: newStatus },
      include: {
        customer: true,
        user: true,
        order: true,
        items: {
          include: {
            presentation: {
              include: { product: true },
            },
          },
        },
      },
    });
  });

  return serializeInvoice(updatedInvoice);
}