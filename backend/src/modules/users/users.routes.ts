//backend/src/modules/users/users.routes.ts
import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { create, list, getOne, update, remove } from "./users.controller";

const router = Router();

// Solo ADMIN puede crear, ver, editar o eliminar usuarios
router.post("/", authenticate, authorize("ADMIN"), create);
router.get("/", authenticate, authorize("ADMIN"), list);
router.get("/:id", authenticate, authorize("ADMIN"), getOne);
router.put("/:id", authenticate, authorize("ADMIN"), update);
router.delete("/:id", authenticate, authorize("ADMIN"), remove);

export default router;