'use strict';

// Stream en memoria para capturar logs estructurados en los tests.
function captureStream() {
  const chunks = [];
  return {
    chunks,
    write(chunk) {
      chunks.push(chunk.toString());
      return true;
    },
    entries() {
      return chunks
        .join('')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
    },
  };
}

module.exports = { captureStream };
