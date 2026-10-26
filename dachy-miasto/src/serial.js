import { parseBenchLine } from './core/monitoring.js';

/** Read-only Web Serial adapter. It never sends control commands to equipment. */
export function createBenchSerial({ onSample, onState, onError }) {
  let port, reader, running = false, connecting = false, task;
  async function read() {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      reader = port.readable.getReader();
      while (running) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 8192) { buffer = ''; onError('serialInvalid'); continue; }
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
          if (!line) continue;
          try { onSample(parseBenchLine(line)); } catch { onError('serialInvalid'); }
        }
      }
    } catch { if (running) onError('serialFailed'); }
    finally {
      running = false; reader?.releaseLock(); reader = null;
      try { await port?.close(); } catch { /* Device may already have been removed. */ }
      port = null; onState(false);
    }
  }
  return {
    supported: Boolean(globalThis.navigator?.serial),
    async connect() {
      if (running || connecting || port) return;
      if (!globalThis.navigator?.serial) { onError('serialUnsupported'); return; }
      connecting = true;
      try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        running = true; onState(true); task = read();
      } catch (error) {
        try { await port?.close(); } catch { /* May not have opened. */ }
        port = null;
        if (error.name !== 'NotFoundError') onError('serialFailed');
      } finally { connecting = false; }
    },
    async disconnect() { running = false; await reader?.cancel(); await task; },
  };
}
