import app from "./src/app.js";
import {env} from "./src/config/env.js"

const PORT = env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose esn puerto ${PORT}`);
});