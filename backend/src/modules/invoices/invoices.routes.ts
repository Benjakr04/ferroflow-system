//backend/src/modules/invoices/invoices.routes.ts
import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { create, list, getOne, updateStatus } from "./invoices.controller";

const router = Router();

// Solo CAJERO y ADMIN pueden crear facturas (el vendedor no factura)
router.post("/", authenticate, authorize("CAJERO", "ADMIN"), create);

// Todos los roles autenticados pueden ver facturas
router.get("/", authenticate, list);
router.get("/:id", authenticate, getOne);

// Solo CAJERO y ADMIN pueden cambiar el estado de una factura
router.put("/:id/status", authenticate, authorize("CAJERO", "ADMIN"), updateStatus);

export default router;