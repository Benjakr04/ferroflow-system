//backend/src/modules/orders/orders.routes.ts
import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { create, list, getOne, update, remove } from "./orders.controller";

const router = Router();

// VENDEDOR, CAJERO, ADMIN pueden crear órdenes
router.post("/", authenticate, authorize("VENDEDOR", "CAJERO", "ADMIN"), create);

// Todos pueden ver órdenes (con authenticate)
router.get("/", authenticate, list);
router.get("/:id", authenticate, getOne);

// VENDEDOR, CAJERO, ADMIN pueden editar (cambiar status de PENDIENTE a ENVIADA)
router.put("/:id", authenticate, authorize("VENDEDOR", "CAJERO", "ADMIN"), update);

// VENDEDOR, CAJERO, ADMIN pueden cancelar (solo si está PENDIENTE)
router.delete("/:id", authenticate, authorize("VENDEDOR", "CAJERO", "ADMIN"), remove);

export default router;