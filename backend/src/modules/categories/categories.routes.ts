//backend/src/modules/categories/categories.routes.ts
import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { create, list, getOne, update, remove } from "./categories.controller";

const router = Router();

// Todos los roles autenticados pueden ver categorías
router.get("/", authenticate, list);
router.get("/:id", authenticate, getOne);

// Solo ADMIN puede crear, editar o desactivar categorías
router.post("/", authenticate, authorize("ADMIN"), create);
router.put("/:id", authenticate, authorize("ADMIN"), update);
router.delete("/:id", authenticate, authorize("ADMIN"), remove);

export default router;