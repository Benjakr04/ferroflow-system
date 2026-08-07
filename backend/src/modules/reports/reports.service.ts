//backend/src/modules/reports/reports.service.ts
import prisma from "../../config/database";
import type {
  salesByPeriodSchema,
  topProductsSchema,
  productMarginsSchema,
} from "./reports.validation";
import type { z } from "zod";
import { Prisma } from "@prisma/client";

type SalesByPeriodInput = z.infer<typeof salesByPeriodSchema>;
type TopProductsInput = z.infer<typeof topProductsSchema>;
type ProductMarginsInput = z.infer<typeof productMarginsSchema>;

export class ReportsDomainError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ReportsDomainError";
  }
}

/**
 * Redondea un numero a 2 decimales (moneda)
 */
function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Arma un filtro de fecha para createdAt a partir de startDate/endDate
 * opcionales. Devuelve undefined si no se pasa ninguna fecha, para que
 * el campo no se incluya en absoluto en el where (en vez de mandar un
 * objeto vacio o con "undefined" adentro, que exactOptionalPropertyTypes
 * no permite).
 */
function buildDateFilter(
  startDate?: string,
  endDate?: string
): Prisma.DateTimeFilter<"Invoice"> | undefined {
  if (!startDate && !endDate) {
    return undefined;
  }

  const filter: Prisma.DateTimeFilter<"Invoice"> = {};
  if (startDate) filter.gte = new Date(startDate);
  if (endDate) filter.lte = new Date(endDate);

  return filter;
}

/**
 * Obtener ventas agrupadas por período (día, semana, mes)
 *
 * Retorna:
 * - periodStart: fecha de inicio del período
 * - periodEnd: fecha de fin del período
 * - totalSales: total en Gs. de todas las facturas en ese período
 * - invoiceCount: cantidad de facturas
 * - averageTicket: ticket promedio (totalSales / invoiceCount)
 */
export async function getSalesByPeriod(data: SalesByPeriodInput) {
  const { startDate, endDate, period } = data;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw new ReportsDomainError("startDate debe ser menor a endDate", 400);
  }

  // Traer todas las facturas en el rango
  const invoices = await prisma.invoice.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
      status: { in: ["PAGADO", "CANCELADO"] }, // Solo facturas "cerradas"
    },
    select: {
      createdAt: true,
      total: true,
    },
  });

  if (invoices.length === 0) {
    return [];
  }

  // Agrupar por período manualmente (Prisma no tiene groupBy por date ranges fácil)
  const grouped = new Map<string, { dates: Date[]; totals: number[] }>();

  invoices.forEach((inv) => {
    let periodKey: string;

    if (period === "day") {
      const dateOnly = inv.createdAt.toISOString().split("T")[0];
      periodKey = dateOnly;
    } else if (period === "week") {
      const d = new Date(inv.createdAt);
      const startOfWeek = new Date(d.setDate(d.getDate() - d.getDay()));
      periodKey = startOfWeek.toISOString().split("T")[0];
    } else {
      // month
      const d = inv.createdAt;
      periodKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    if (!grouped.has(periodKey)) {
      grouped.set(periodKey, { dates: [], totals: [] });
    }

    const group = grouped.get(periodKey)!;
    group.dates.push(inv.createdAt);
    group.totals.push(Number(inv.total));
  });

  // Convertir a array y ordenar por fecha
  const result = Array.from(grouped.entries())
    .map(([periodKey, { dates, totals }]) => {
      const totalSales = roundToTwo(totals.reduce((a, b) => a + b, 0));
      const invoiceCount = dates.length;
      const averageTicket = roundToTwo(totalSales / invoiceCount);

      // Calcular inicio y fin del período
      let periodStart: Date;
      let periodEnd: Date;

      if (period === "day") {
        const date = new Date(periodKey);
        periodStart = new Date(date.setHours(0, 0, 0, 0));
        periodEnd = new Date(date.setHours(23, 59, 59, 999));
      } else if (period === "week") {
        const date = new Date(periodKey);
        periodStart = new Date(date);
        periodEnd = new Date(date.setDate(date.getDate() + 6));
        periodEnd.setHours(23, 59, 59, 999);
      } else {
        // month
        const [year, month] = periodKey.split("-");
        periodStart = new Date(parseInt(year), parseInt(month) - 1, 1);
        periodEnd = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
      }

      return {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalSales,
        invoiceCount,
        averageTicket,
      };
    })
    .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime());

  return result;
}

/**
 * Obtener top N productos más vendidos
 *
 * Retorna:
 * - id_product, nombre, cantidad_vendida, total_vendido (Gs.)
 */
export async function getTopProducts(data: TopProductsInput) {
  const { limit, startDate, endDate } = data;

  const dateFilter = buildDateFilter(startDate, endDate);

  // Armamos el where del invoice a mano: solo agregamos createdAt si
  // realmente hay un filtro de fecha, evitando el problema de tipos con
  // exactOptionalPropertyTypes al mezclar spreads condicionales.
  const invoiceFilter: Prisma.InvoiceWhereInput = {
    status: { in: ["PAGADO", "CANCELADO"] },
  };
  if (dateFilter) {
    invoiceFilter.createdAt = dateFilter;
  }

  // Traer todos los items de facturas en el período
  const items = await prisma.invoiceItem.findMany({
    where: {
      invoice: invoiceFilter,
    },
    include: {
      presentation: {
        include: { product: true },
      },
      invoice: true,
    },
  });

  // Agrupar por producto
  const productSales = new Map<number, { name: string; quantity: number; total: number }>();

  items.forEach((item) => {
    const productId = item.presentation.product.id_product;
    const productName = item.presentation.product.name;
    const quantity = Number(item.quantity);
    const itemTotal = Number(item.subtotal) + Number(item.ivaAmount);

    if (!productSales.has(productId)) {
      productSales.set(productId, { name: productName, quantity: 0, total: 0 });
    }

    const entry = productSales.get(productId)!;
    entry.quantity += quantity;
    entry.total += itemTotal;
  });

  // Convertir a array, ordenar por total vendido DESC, tomar top N
  const result = Array.from(productSales.entries())
    .map(([id_product, { name, quantity, total }]) => ({
      id_product,
      name,
      quantity: roundToTwo(quantity),
      total_sold: roundToTwo(total),
    }))
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, limit);

  return result;
}

/**
 * Obtener margen de ganancia por producto
 *
 * Para cada producto, calcula:
 * - Precio promedio de venta (de las facturas)
 * - Costo promedio (del costPrice de sus proveedores)
 * - Margen unitario (precio - costo)
 * - Margen porcentaje ((precio - costo) / precio * 100)
 */
export async function getProductMargins(data: ProductMarginsInput) {
  const { startDate, endDate } = data;

  const dateFilter = buildDateFilter(startDate, endDate);

  // Mismo patron: armamos el where del invoice a mano, agregando
  // createdAt solo si hay filtro de fecha.
  const invoiceFilter: Prisma.InvoiceWhereInput = {
    status: { in: ["PAGADO", "CANCELADO"] },
  };
  if (dateFilter) {
    invoiceFilter.createdAt = dateFilter;
  }

  // Traer todos los productos con sus presentaciones, proveedores e items de factura
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      presentations: {
        include: {
          invoiceItems: {
            where: {
              invoice: invoiceFilter,
            },
            include: {
              invoice: true,
            },
          },
          product: {
            include: {
              productSuppliers: {
                where: { active: true, supplier: { active: true } },
              },
            },
          },
        },
      },
    },
  });

  const result = products
    .map((product) => {
      // Calcular precio promedio de venta
      const allInvoiceItems = product.presentations.flatMap((p) => p.invoiceItems);

      if (allInvoiceItems.length === 0) {
        return null; // Sin ventas, no incluir en reporte
      }

      const avgSalePrice = roundToTwo(
        allInvoiceItems.reduce((sum, item) => sum + Number(item.unitPrice), 0) /
          allInvoiceItems.length
      );

      // Calcular costo promedio de proveedores
      const supplierPrices = product.presentations
        .flatMap((p) => p.product.productSuppliers)
        .map((ps) => (ps.costPrice ? Number(ps.costPrice) : null))
        .filter((price) => price !== null) as number[];

      const avgCost =
        supplierPrices.length > 0
          ? roundToTwo(supplierPrices.reduce((a, b) => a + b, 0) / supplierPrices.length)
          : 0;

      // Calcular margen
      const unitMargin = roundToTwo(avgSalePrice - avgCost);
      const marginPercent = avgSalePrice > 0 ? roundToTwo((unitMargin / avgSalePrice) * 100) : 0;

      return {
        id_product: product.id_product,
        product_name: product.name,
        average_sale_price: avgSalePrice,
        average_cost: avgCost,
        unit_margin: unitMargin,
        margin_percent: marginPercent,
        units_sold: allInvoiceItems.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.margin_percent - a.margin_percent);

  return result;
}