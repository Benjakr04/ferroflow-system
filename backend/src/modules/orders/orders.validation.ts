//backend/src/modules/orders/orders.validation.ts
import { z } from "zod";

/**
 * FLUJO DE ÓRDENES EN FERROFLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Una Orden es un documento INTERNO de trabajo, NO un documento legal.
 * Representa lo que el CLIENTE quiere comprar, antes de que se genere la factura.
 * 
 * CICLO DE VIDA DE UNA ORDEN:
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * 1. PENDIENTE (estado inicial)
 *    - VENDEDOR o CAJERO crea la orden con los datos del cliente
 *    - Se agrega un listado de productos: { presentación, cantidad, precio }
 *    - En este estado, la orden es TOTALMENTE EDITABLE
 *    - Se puede: agregar items, editar cantidades, quitar items, cambiar observaciones
 *    - Se puede CANCELAR si el cliente cambia de idea
 *    - No se descuenta stock en este punto
 * 
 * 2. ENVIADA (listo para facturar)
 *    - Cuando el VENDEDOR/CAJERO termina la orden, cambia el status a ENVIADA
 *    - Una vez ENVIADA, la orden es INMUTABLE (no se puede editar)
 *    - En este punto se RESERVA el stock (aunque no es obligatorio implementarlo ahora)
 *    - El CAJERO ahora puede crear una FACTURA basada en esta orden
 *    - La factura copia los datos de la orden (cliente, items, cantidades, precios)
 *    - NO se puede CANCELAR una orden ENVIADA (porque ya hay una intención clara)
 * 
 * 3. CANCELADA
 *    - Solo se puede cancelar si la orden está en PENDIENTE
 *    - Si una orden está ENVIADA, no se cancela (se hace una factura de devolución)
 *    - Al cancelar, simplemente se marca el status
 *    - No hay efecto en stock (porque nunca se descontó)
 * 
 * ────────────────────────────────────────────────────────────────────────────
 * DIFERENCIA ORDEN vs FACTURA:
 * 
 * Orden:
 *   - Documento INTERNO, de trabajo
 *   - Se puede editar mientras esté PENDIENTE
 *   - Se puede cancelar
 *   - No genera obligaciones legales/tributarias
 *   - El VENDEDOR la arma
 * 
 * Factura (futura integración SIFEN):
 *   - Documento LEGAL y TRIBUTARIO
 *   - NO se puede editar (es inmutable por ley)
 *   - Se crea basada en una orden ENVIADA
 *   - Descuenta stock de verdad
 *   - Genera obligaciones legales/tributarias (SIFEN)
 *   - El CAJERO la crea
 * ────────────────────────────────────────────────────────────────────────────
 */

const orderStatuses = ["PENDIENTE", "ENVIADA", "CANCELADA"] as const;

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