import app from "./src/app";
import { env } from "./src/config/env";

const PORT = env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});