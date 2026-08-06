//backend/src/modules/orders/orders.routes.ts
import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { create, list, getOne, update, remove } from "./orders.controller";

const router = Router();

// VENDEDOR y CAJERO pueden crear órdenes
router.post("/", authenticate, authorize("VENDEDOR", "CAJERO", "ADMIN"), create);

// Todos pueden ver órdenes (con authenticate)
router.get("/", authenticate, list);
router.get("/:id", authenticate, getOne);

// Solo CAJERO y ADMIN pueden actualizar estado
router.put("/:id", authenticate, authorize("CAJERO", "ADMIN"), update);

// Solo ADMIN puede cancelar
router.delete("/:id", authenticate, authorize("ADMIN"), remove);

export default router;