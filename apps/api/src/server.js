/**
 * Servidor HTTP mínimo (sin dependencias) que expone el historial de mensajes.
 *
 * Se usa el módulo `node:http` para no introducir dependencias mientras el
 * scaffolding del framework REST no esté disponible. Cuando exista, este
 * controlador puede montarse como router del framework elegido.
 */

import http from 'node:http';
import { createMessageService } from './messages/messageService.js';
import { createMessageController } from './messages/messageController.js';
import { InMemoryMessageRepository } from './messages/messageRepository.js';

/**
 * Crea el servidor HTTP con las rutas de mensajes montadas.
 * @param {{ repository?: InMemoryMessageRepository, resolveTenant?: (req:any)=>(string|null) }} [deps]
 */
export function createServer(deps = {}) {
  const repository = deps.repository ?? new InMemoryMessageRepository();
  const messageService = createMessageService(repository);
  const messageController = createMessageController({
    messageService,
    resolveTenant: deps.resolveTenant,
  });

  return http.createServer(async (req, res) => {
    try {
      const handled = await messageController(req, res);
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'ruta no encontrada' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'error interno' }));
    }
  });
}

// Arranque directo: `node src/server.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API escuchando en :${port}`);
  });
}
