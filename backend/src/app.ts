import express from "express";
import cors from "cors";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas básicas (por ahora)
app.get("/", (req, res) => {
  res.json({ mensaje: "Bienvenido a FerroFlow API" });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

export default app;