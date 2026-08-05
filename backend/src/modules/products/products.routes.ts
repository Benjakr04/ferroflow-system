import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { create, list, getOne, update, remove } from "./products.controller";

const router = Router();

// Cualquier usuario autenticado puede ver productos
router.get("/", authenticate, list);
router.get("/:id", authenticate, getOne);

// Solo ADMIN puede crear, editar o eliminar productos
router.post("/", authenticate, authorize("ADMIN"), create);
router.put("/:id", authenticate, authorize("ADMIN"), update);
router.delete("/:id", authenticate, authorize("ADMIN"), remove);

export default router;