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
 * Genera el siguiente numero de factura secuencial.
 * Formato: 001-001-0000001 (establecimiento-punto_expedicion-secuencial)
 *
 * NOTA: Esta es una implementacion simple pensada para desarrollo/una sola
 * caja. En produccion, el establecimiento y punto de expedicion deben salir
 * de la configuracion real de la ferreteria (dato registrado en Marangatu).
 */
async function generateInvoiceNumber(): Promise<string> {
  const count = await prisma.invoice.count();
  const nextNumber = count + 1;
  const sequential = nextNumber.toString().padStart(7, "0");
  return `001-001-${sequential}`;
}

/**
 * Crear una factura a partir de una Orden en estado ENVIADA
 *
 * Flujo:
 * 1. Verifica que la orden exista y este en estado ENVIADA
 * 2. Verifica que la orden no tenga ya una factura asociada
 * 3. Re-valida el stock (puede haber cambiado desde que se creo la orden)
 * 4. Calcula subtotal, IVA (10%) y total a partir de los items de la orden
 * 5. Genera el numero de factura secuencial
 * 6. Crea la factura + items, y descuenta el stock real de los productos
 *
 * Todo el paso 6 ocurre dentro de una transaccion: si algo falla, no se
 * descuenta stock a medias ni queda una factura sin sus items.
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

  // Calcular subtotal, IVA y total a partir de los items de la orden
  let subtotal = 0;
  const itemsData = order.items.map((item) => {
    const itemSubtotal = Number(item.quantity) * Number(item.unitPrice);
    const itemIva = itemSubtotal * IVA_RATE;
    subtotal += itemSubtotal;

    return {
      id_presentation: item.id_presentation,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: itemSubtotal,
      ivaAmount: itemIva,
    };
  });

  const tax = subtotal * IVA_RATE;
  const total = subtotal + tax;

  const invoiceNumber = await generateInvoiceNumber();

  // Datos del cliente copiados al momento de emitir, para conservar el
  // historial aunque el cliente edite sus datos despues
  const clientRUC = order.customer.documentNumber ?? null;
  const clientType = order.customer.type;

  // Transaccion: crear factura + items + descontar stock real, todo o nada
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
          create: itemsData,
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

    // Descontar el stock real de cada producto involucrado
    for (const item of order.items) {
      const neededStock = Number(item.quantity) * Number(item.presentation.conversionRate);
      await tx.product.update({
        where: { id_product: item.presentation.id_product },
        data: {
          stock: {
            decrement: neededStock,
          },
        },
      });
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

  // CANCELADO y DEVOLUCION implican devolver el stock descontado al crear la factura
  const shouldRestoreStock = newStatus === "CANCELADO" || newStatus === "DEVOLUCION";

  const updatedInvoice = await prisma.$transaction(async (tx) => {
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