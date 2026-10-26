import test from 'node:test';
import assert from 'node:assert/strict';
import { createBenchSerial } from '../src/serial.js';

test('USB reader handles split lines, skips corrupt input and releases the port on disconnect', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let stream, closed = false, opened;
  const port = {
    readable: new ReadableStream({ start(controller) { stream = controller; } }),
    async open(options) { opened = options; }, async close() { closed = true; },
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serial: { async requestPort() { return port; } } } });
  const samples = [], states = [], errors = [];
  const serial = createBenchSerial({ onSample: s => samples.push(s), onState: s => states.push(s), onError: e => errors.push(e) });
  try {
    assert.equal(serial.supported, true); await serial.connect();
    const encode = text => new TextEncoder().encode(text);
    stream.enqueue(encode('{"voltageV":6,"cur'));
    stream.enqueue(encode('rentA":0.5}\nnot-json\n{"voltageV":5,"currentA":0.2}\n'));
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.deepEqual(samples.map(s => s.powerW), [3, 1]);
    assert.deepEqual(errors, ['serialInvalid']); assert.deepEqual(opened, { baudRate: 115200 });
    await serial.disconnect();
    assert.equal(closed, true); assert.deepEqual(states, [true, false]);
  } finally { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; }
});
