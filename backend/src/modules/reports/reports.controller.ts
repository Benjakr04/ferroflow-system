//backend/src/modules/reports/reports.controller.ts
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth.middleware";
import { z } from "zod";
import { salesByPeriodSchema, topProductsSchema, productMarginsSchema } from "./reports.validation";
import { ReportsDomainError, getSalesByPeriod, getTopProducts, getProductMargins } from "./reports.service";

/**
 * GET /reports/sales-by-period?startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z&period=month
 *
 * Ventas agrupadas por período (día, semana, mes)
 */
export async function salesByPeriod(req: AuthenticatedRequest, res: Response) {
  try {
    const query = req.query;

    const data = salesByPeriodSchema.parse({
      startDate: query.startDate,
      endDate: query.endDate,
      period: query.period,
    });

    const result = await getSalesByPeriod(data);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof ReportsDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al generar reporte de ventas" });
  }
}

/**
 * GET /reports/top-products?limit=10&startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z
 *
 * Top N productos más vendidos
 */
export async function topProducts(req: AuthenticatedRequest, res: Response) {
  try {
    const query = req.query;

    const data = topProductsSchema.parse({
      limit: query.limit ? Number(query.limit) : 10,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const result = await getTopProducts(data);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof ReportsDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al generar reporte de productos" });
  }
}

/**
 * GET /reports/product-margins?startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z
 *
 * Margen de ganancia por producto
 */
export async function productMargins(req: AuthenticatedRequest, res: Response) {
  try {
    const query = req.query;

    const data = productMarginsSchema.parse({
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const result = await getProductMargins(data);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof ReportsDomainError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Error al generar reporte de márgenes" });
  }
}