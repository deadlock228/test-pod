
'use strict';

const { createServer } = require('./server');
const { createLogger } = require('./logger');
const { createQueueMetrics } = require('./queueMetrics');
const { createDbCheck, createQueueCheck } = require('./checks');

function main() {
  const logger = createLogger({ level: process.env.LOG_LEVEL || 'info' });
  const metrics = createQueueMetrics();
  const { server } = createServer({
    logger,
    metrics,
    checkDb: createDbCheck(),
    checkQueue: createQueueCheck(),
  });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => logger.info('server.listening', { port }));
  return { server, logger, metrics };
}

if (require.main === module) {
  main();
}

module.exports = { main };

