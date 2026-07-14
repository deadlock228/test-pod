/**
 * Cola de trabajos en memoria con soporte de jobs demorados (delay).
 *
 * Interfaz deliberadamente simple para poder sustituirla por una cola real
 * (Redis / BullMQ) sin tocar el worker. El worker sólo depende de:
 *   - enqueue(payload, { delayMs })
 *   - dequeue()  -> job | null (respeta la disponibilidad temporal)
 *   - size()
 *
 * El reloj (`now`) es inyectable para poder testear delays de forma determinista.
 */

export class InMemoryQueue {
  /**
   * @param {{ now?: () => number }} [opts]
   */
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    /** @type {Array<{ id: number, payload: any, availableAt: number, enqueuedAt: number }>} */
    this._jobs = [];
    this._seq = 0;
  }

  /**
   * Encola un payload. Si `delayMs > 0`, el job no será visible hasta que pase.
   * @param {any} payload
   * @param {{ delayMs?: number }} [opts]
   */
  enqueue(payload, { delayMs = 0 } = {}) {
    const t = this.now();
    const job = {
      id: ++this._seq,
      payload,
      enqueuedAt: t,
      availableAt: t + Math.max(0, delayMs),
    };
    this._jobs.push(job);
    return job;
  }

  /**
   * Extrae el primer job disponible (availableAt <= now), en orden FIFO entre
   * los disponibles. Devuelve null si no hay ninguno disponible.
   * @returns {{ id: number, payload: any, availableAt: number, enqueuedAt: number } | null}
   */
  dequeue() {
    const t = this.now();
    const idx = this._jobs.findIndex((j) => j.availableAt <= t);
    if (idx === -1) return null;
    const [job] = this._jobs.splice(idx, 1);
    return job;
  }

  /** Cantidad total de jobs pendientes (incluye demorados). */
  size() {
    return this._jobs.length;
  }

  /** Cantidad de jobs disponibles ahora mismo. */
  ready() {
    const t = this.now();
    return this._jobs.filter((j) => j.availableAt <= t).length;
  }
}
