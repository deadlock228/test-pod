'use strict';

// Registro simple de métricas de la cola de envío de emails.
// Expone contadores/gauges y su render en formato Prometheus y JSON.
const DEFAULT_STATE = {
  enqueued: 0, // jobs encolados
  active: 0, // jobs en proceso
  waiting: 0, // jobs esperando
  sent: 0, // emails enviados con éxito
  failed: 0, // envíos fallidos definitivamente
  retried: 0, // reintentos ejecutados
  delayed: 0, // jobs programados a futuro
};

function createQueueMetrics(initial = {}) {
  const state = { ...DEFAULT_STATE, ...initial };

  return {
    incr(name, by = 1) {
      if (typeof state[name] !== 'number') state[name] = 0;
      state[name] += by;
      return state[name];
    },
    set(name, value) {
      state[name] = value;
      return value;
    },
    get(name) {
      return state[name];
    },
    snapshot() {
      return { ...state };
    },
    reset() {
      for (const key of Object.keys(state)) state[key] = 0;
    },
    toPrometheus(prefix = 'send_queue') {
      const lines = [];
      for (const [key, value] of Object.entries(state)) {
        const metric = `${prefix}_${key}`;
        lines.push(`# TYPE ${metric} gauge`);
        lines.push(`${metric} ${value}`);
      }
      return lines.join('\n') + '\n';
    },
  };
}

module.exports = { createQueueMetrics, DEFAULT_STATE };
