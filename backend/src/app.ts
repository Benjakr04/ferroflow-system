import express from "express";
import cors from "cors";

import authRoutes from "./modules/auth/auth.routes";
import productsRoutes from "./modules/products/products.routes";
import usersRoutes from "./modules/users/users.routes";
import ordersRoutes from "./modules/orders/orders.routes";


const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas de la API
const apiRouter = express.Router();
apiRouter.use("/auth", authRoutes);
apiRouter.use("/products", productsRoutes); 
apiRouter.use("/users", usersRoutes);
apiRouter.use("/orders", ordersRoutes);
app.use("/api", apiRouter);   

// Rutas básicas
app.get("/", (req, res) => {
  res.json({ mensaje: "Bienvenido a FerroFlow API" });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

export default app;