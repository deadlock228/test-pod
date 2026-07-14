/**
 * Cola de trabajos en memoria (stand-in de Redis/BullMQ para este slice).
 * El worker de envío (B10) consumirá estos jobs; aquí sólo encolamos.
 */
export function createQueue() {
  const jobs = [];
  return {
    enqueue(name, payload) {
      const job = {
        id: jobs.length + 1,
        name,
        payload,
        enqueued_at: new Date().toISOString(),
      };
      jobs.push(job);
      return job;
    },
    get jobs() {
      return jobs;
    },
    size() {
      return jobs.length;
    },
  };
}
