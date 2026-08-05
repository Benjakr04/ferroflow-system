import express from "express";
import cors from "cors";

import authRoutes from "./modules/auth/auth.routes";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas de la API
const apiRouter = express.Router();
apiRouter.use("/auth", authRoutes);
app.use("/api", apiRouter);   

// Rutas básicas
app.get("/", (req, res) => {
  res.json({ mensaje: "Bienvenido a FerroFlow API" });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

export default app;