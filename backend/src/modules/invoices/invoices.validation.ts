//backend/src/modules/invoices/invoices.validation.ts
import { z } from "zod";

/**
 * MODULO DE FACTURACION (INVOICES)
 * ============================================================================
 *
 * Una factura SIEMPRE se crea a partir de una Orden en estado ENVIADA.
 * No existe la posibilidad de crear una factura "suelta" sin orden, porque
 * eso rompe la trazabilidad Vendedor -> Cajero -> Factura que se definio
 * para el negocio.
 *
 * Flujo:
 * 1. Orden pasa de PENDIENTE a ENVIADA (el vendedor/cajero la da por lista)
 * 2. El CAJERO o ADMIN crea la factura indicando el id_order
 * 3. El sistema copia los items de la orden, calcula IVA (10%) y descuenta stock
 * 4. La factura nace en estado DRAFT y luego se puede marcar PAGADO
 *
 * Sobre SIFEN: este modulo NO genera XML ni se conecta a la SET todavia.
 * Solo se encarga de la logica interna (calculo, stock, numeracion).
 * La integracion con SIFEN se hara despues como un servicio aparte que
 * lee estos mismos datos, sin tener que tocar esta logica base.
 */

const saleConditions = ["CONTADO", "CREDITO"] as const;

const paymentMethods = [
  "EFECTIVO",
  "TARJETA_DEBITO",
  "TARJETA_CREDITO",
  "CHEQUE",
  "TRANSFERENCIA",
  "OTRO",
] as const;

const invoiceStatuses = ["DRAFT", "PAGADO", "CANCELADO", "DEVOLUCION"] as const;

export const createInvoiceSchema = z.object({
  id_order: z.number().int().positive(),
  saleCondition: z.enum(saleConditions),
  paymentMethod: z.enum(paymentMethods),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(invoiceStatuses),
});

export const invoiceStatusValues = invoiceStatuses;