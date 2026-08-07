//backend/src/modules/reports/reports.routes.ts
import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { salesByPeriod, topProducts, productMargins } from "./reports.controller";

const router = Router();

// Todos los reportes: solo ADMIN puede ver datos sensibles de negocio
// (aunque vendedores/cajeros podrían ver stats básicas, aquí lo limitamos)

router.get("/sales-by-period", authenticate, authorize("ADMIN"), salesByPeriod);
router.get("/top-products", authenticate, authorize("ADMIN"), topProducts);
router.get("/product-margins", authenticate, authorize("ADMIN"), productMargins);

export default router;