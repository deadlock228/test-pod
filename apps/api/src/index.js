import { createApp } from './server.js';

const port = Number(process.env.PORT || 3000);
const { server } = createApp();

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] escuchando en http://localhost:${port}`);
});
