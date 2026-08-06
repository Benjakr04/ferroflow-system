//backend/src/modules/invoices/invoices.controller.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth.middleware";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createInvoiceSchema, updateInvoiceStatusSchema } from "./invoices.validation";
import {
  InvoiceDomainError,
  createInvoiceFromOrder,
  getAllInvoices,
  getInvoiceById,
  updateInvoiceStatus,
} from "./invoices.service";

/**
 * POST /invoices
 *
 * Crear una factura a partir de una orden en estado ENVIADA
 *
 * Roles permitidos: CAJERO, ADMIN
 *
 * Body:
 * {
 *   "id_order": 1,
 *   "saleCondition": "CONTADO",
 *   "paymentMethod": "EFECTIVO"
 * }
 *
 * Response: 201 Created con datos de la factura
 */
export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const data = createInvoiceSchema.parse(req.body);
    const invoice = await createInvoiceFromOrder(req.user!.id_user, data);
    return res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof InvoiceDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // P2002 puede ser por id_order o invoiceNumber unique constraint
      // id_order: ya tiene factura asociada
      // invoiceNumber: race condition en la generacion del numero
      const target = error.meta?.target as string[] | undefined;
      if (target?.includes("id_order")) {
        return res.status(409).json({ error: "Esta orden ya tiene una factura asociada" });
      } else {
        return res.status(409).json({ error: "Numero de factura duplicado. Reintenta la operacion" });
      }
    }
    console.error(error);
    return res.status(500).json({ error: "Error al crear la factura" });
  }
}

/**
 * GET /invoices
 *
 * Listar todas las facturas con filtros opcionales
 *
 * Query params:
 * - status: DRAFT, PAGADO, CANCELADO, DEVOLUCION (opcional)
 * - id_customer: numero de cliente (opcional)
 *
 * Response: 200 OK con array de facturas
 */
export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const id_customer = req.query.id_customer
      ? Number(req.query.id_customer)
      : undefined;

    const validStatuses = ["DRAFT", "PAGADO", "CANCELADO", "DEVOLUCION"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status invalido. Valores permitidos: ${validStatuses.join(", ")}`,
      });
    }

    if (id_customer !== undefined) {
      if (!Number.isSafeInteger(id_customer) || id_customer <= 0) {
        return res.status(400).json({ error: "ID de cliente invalido" });
      }
    }

    const filters: { status?: string; id_customer?: number } = {};
    if (status) filters.status = status;
    if (id_customer) filters.id_customer = id_customer;

    const invoices = await getAllInvoices(filters);
    return res.status(200).json(invoices);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener las facturas" });
  }
}

/**
 * GET /invoices/:id
 *
 * Obtener una factura especifica por ID
 *
 * Response: 200 OK con datos de la factura, o 404 si no existe
 */
export async function getOne(req: AuthenticatedRequest, res: Response) {
  try {
    const id_invoice = Number(req.params.id);
    if (!Number.isSafeInteger(id_invoice) || id_invoice <= 0) {
      return res.status(400).json({ error: "ID de factura invalido" });
    }

    const invoice = await getInvoiceById(id_invoice);
    if (!invoice) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    return res.status(200).json(invoice);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener la factura" });
  }
}

/**
 * PUT /invoices/:id/status
 *
 * Cambiar el estado de una factura (PAGADO, CANCELADO, DEVOLUCION)
 *
 * Roles permitidos: CAJERO, ADMIN
 *
 * Body:
 * { "status": "PAGADO" }
 *
 * Response: 200 OK con datos actualizados
 * Response: 409 Conflict si la transicion de estado no es valida
 */
export async function updateStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const id_invoice = Number(req.params.id);
    if (!Number.isSafeInteger(id_invoice) || id_invoice <= 0) {
      return res.status(400).json({ error: "ID de factura invalido" });
    }

    const data = updateInvoiceStatusSchema.parse(req.body);
    const invoice = await updateInvoiceStatus(id_invoice, data);
    return res.status(200).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof InvoiceDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ error: "Factura no encontrada" });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar la factura" });
  }
}