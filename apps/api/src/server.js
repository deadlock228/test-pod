// Punto de entrada de la API.
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const { server } = createApp({ secret: process.env.JWT_SECRET });

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API escuchando en http://localhost:${port}`);
});
