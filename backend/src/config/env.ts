import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: process.env.PORT || "3001",
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "tu_clave_secreta",
  NODE_ENV: process.env.NODE_ENV || "development",
};