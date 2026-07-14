/**
 * Cola en memoria que emula el rol de Redis/BullMQ para desacoplar el encolado
 * del envío real. Un adaptador real implementaría la misma interfaz `enqueue`.
 */
export class InMemoryQueue {
  constructor() {
    this.jobs = [];
  }

  enqueue(name, payload) {
    const job = { id: this.jobs.length + 1, name, payload };
    this.jobs.push(job);
    return job;
  }

  get size() {
    return this.jobs.length;
  }
}
