//backend/src/modules/suppliers/suppliers.routes.ts
import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import {
  create,
  list,
  getOne,
  update,
  remove,
  linkProduct,
  listProductsForSupplier,
  updateLink,
  unlinkProduct,
  listSuppliersForProduct,
} from "./suppliers.controller";

const router = Router();

/**
 * IMPORTANTE: las rutas especificas ("by-product") van ANTES de las
 * rutas genericas con parametro ("/:id"), porque Express matchea en
 * orden y "/:id" capturaria "by-product" como si fuera un ID.
 */

// Comparar proveedores de un producto especifico (cualquier autenticado)
router.get("/by-product/:id_product", authenticate, listSuppliersForProduct);

// CRUD de proveedores
router.post("/", authenticate, authorize("ADMIN"), create);
router.get("/", authenticate, list);
router.get("/:id", authenticate, getOne);
router.put("/:id", authenticate, authorize("ADMIN"), update);
router.delete("/:id", authenticate, authorize("ADMIN"), remove);

// Asociacion producto-proveedor (precio de compra, etc)
router.post("/:id/products", authenticate, authorize("ADMIN"), linkProduct);
router.get("/:id/products", authenticate, listProductsForSupplier);
router.put("/:id/products/:id_product", authenticate, authorize("ADMIN"), updateLink);
router.delete("/:id/products/:id_product", authenticate, authorize("ADMIN"), unlinkProduct);

export default router;