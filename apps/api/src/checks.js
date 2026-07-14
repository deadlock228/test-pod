'use strict';

const net = require('node:net');

// Ping TCP de liveness (sin dependencias de drivers): abre y cierra una
// conexión al host:port. Sirve como check básico para Postgres y Redis.
function tcpPing(host, port, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    socket.setTimeout(timeoutMs);
    socket.once('error', fail);
    socket.once('timeout', () => fail(new Error(`tcp timeout ${host}:${port}`)));
    socket.connect(port, host, () => {
      if (settled) return;
      settled = true;
      socket.end();
      resolve(true);
    });
  });
}

function parseHostPort(urlString, defaultPort) {
  const u = new URL(urlString);
  const port = u.port ? Number(u.port) : defaultPort;
  return { host: u.hostname, port };
}

function createDbCheck(databaseUrl = process.env.DATABASE_URL, opts = {}) {
  return async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL not configured');
    const { host, port } = parseHostPort(databaseUrl, 5432);
    await tcpPing(host, port, opts.timeoutMs);
    return { host, port };
  };
}

function createQueueCheck(redisUrl = process.env.REDIS_URL, opts = {}) {
  return async () => {
    if (!redisUrl) throw new Error('REDIS_URL not configured');
    const { host, port } = parseHostPort(redisUrl, 6379);
    await tcpPing(host, port, opts.timeoutMs);
    return { host, port };
  };
}

module.exports = { tcpPing, parseHostPort, createDbCheck, createQueueCheck };
