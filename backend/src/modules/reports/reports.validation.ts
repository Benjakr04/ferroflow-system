//backend/src/modules/reports/reports.validation.ts
import { z } from "zod";

/**
 * MODULO DE REPORTES (REPORTS)
 * ============================================================================
 *
 * Reportes analytícos del negocio de la ferretería:
 * - Ventas por período (día, semana, mes)
 * - Top 10 productos más vendidos
 * - Margen de ganancia por producto
 */

const periodTypes = ["day", "week", "month"] as const;

/**
 * Parámetros para consultar ventas en un rango de fechas
 */
export const salesByPeriodSchema = z.object({
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
  period: z.enum(periodTypes).default("day"),
});

/**
 * Parámetros para listar top N productos
 */
export const topProductsSchema = z.object({
  limit: z.number().int().positive().max(100).default(10),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

/**
 * Parámetros para ver margen por producto
 */
export const productMarginsSchema = z.object({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});