import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const browser = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const offline = process.argv.includes('--offline');
const urlAt = process.argv.indexOf('--url');
const targetUrl = urlAt >= 0 ? process.argv[urlAt + 1] : 'http://127.0.0.1:4173/';
const output = fileURLToPath(new URL('../.preview/', import.meta.url));
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, 'chrome-'));
const processHandle = spawn(browser, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-extensions', '--disable-sync', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--window-size=1440,1050', targetUrl,
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const browserLogs = [];
processHandle.stderr.on('data', chunk => browserLogs.push(chunk.toString()));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const errors = [];
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); }
  }
  if (!port) throw new Error('Browser did not expose its local DevTools endpoint.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id); clearTimeout(handler.timeout);
    message.error ? handler.reject(new Error(JSON.stringify(message.error))) : handler.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 20000);
    pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error('UI condition timed out: ' + expression);
  };
  const ready = () => waitFor(`Boolean(document.querySelector('#calculation-status')) && !document.querySelector('.shell.calculating')`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const set = (selector, value, event = 'change') => evaluate(`{ const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(String(value))}; el.dispatchEvent(new Event(${JSON.stringify(event)}, {bubbles:true})); }`);
  await call('Runtime.enable'); await call('Page.enable');
  if (offline) {
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['*://tile.openstreetmap.org/*'] });
    await call('Page.reload', { ignoreCache: true });
  }
  await call('Page.setDownloadBehavior', { behavior: 'deny' });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await ready();
  await click('[data-action="reset"]'); await ready();
  await waitFor(`Boolean(document.querySelector('.leaflet-container'))`);
  if (!offline) await waitFor(`document.querySelectorAll('.leaflet-tile-loaded').length > 0`);
  const initial = await evaluate(`({title:document.title, language:document.documentElement.lang, roofs:document.querySelectorAll('.portfolio-list .roof-row').length, geometry:document.querySelector('.map-label strong').textContent, budget:document.querySelector('#budget').value, streetTiles:document.querySelectorAll('.leaflet-tile-loaded').length})`);
  assert.equal(initial.roofs, 6);
  assert.match(initial.geometry, /Краков/);
  assert.equal(initial.language, 'ru');
  assert.ok(await evaluate(`document.querySelector('.numeric-formula').textContent.includes('×')`));
  assert.ok(await evaluate(`document.querySelector('.explain-panel').textContent.includes('sumapc')`));
  const clickedRoof = await evaluate(`{ const el=document.querySelector('#city-map [data-roof-id]'); const id=el.dataset.roofId; el.dispatchEvent(new MouseEvent('click',{bubbles:true})); id; }`);
  assert.equal(await evaluate(`document.querySelector('.detail-id').textContent`), clickedRoof);
  assert.ok(await evaluate(`document.querySelector('.map-selected-summary').textContent.includes(${JSON.stringify(clickedRoof.split('.').slice(-2).join('.').replace('_BUD',''))})`));
  const mapBox = await evaluate(`{ const r=document.querySelector('#city-map').getBoundingClientRect(); ({x:r.x+r.width*.65,y:r.y+r.height*.6}); }`);
  const zoomBefore = await evaluate(`Number(document.querySelector('#city-map').dataset.zoom)`);
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mapBox.x, y: mapBox.y, deltaX: 0, deltaY: -420 });
  await waitFor(`Number(document.querySelector('#city-map').dataset.zoom) > ${zoomBefore}`);
  const centerBefore = await evaluate(`document.querySelector('#city-map').dataset.center`);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mapBox.x, y: mapBox.y });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: mapBox.x, y: mapBox.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i=1;i<=5;i++) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mapBox.x + i*16, y: mapBox.y + i*5, button: 'left', buttons: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mapBox.x + 80, y: mapBox.y + 25, button: 'left', buttons: 0, clickCount: 1 });
  await waitFor(`document.querySelector('#city-map').dataset.center !== ${JSON.stringify(centerBefore)}`);
  await pause(250);
  const preserved = await evaluate(`({center:document.querySelector('#city-map').dataset.center,zoom:document.querySelector('#city-map').dataset.zoom})`);

  await set('#budget', 0); await ready();
  assert.equal(await evaluate(`document.querySelectorAll('.portfolio-list .roof-row').length`), 0);
  assert.ok(await evaluate(`document.querySelector('.portfolio-list').textContent.includes('В этот бюджет ничего не выбрано')`));
  assert.deepEqual(await evaluate(`({center:document.querySelector('#city-map').dataset.center,zoom:document.querySelector('#city-map').dataset.zoom})`), preserved);
  await set('#budget', 1); await ready();
  assert.ok(await evaluate(`document.querySelectorAll('.portfolio-list .roof-row').length > 0`));
  await click('.portfolio-list .roof-row');
  assert.ok(await evaluate(`Number(document.querySelector('#city-map').dataset.zoom) >= 16`));
  const excluded = await evaluate(`document.querySelector('.detail-id').textContent`);
  await click('[data-action="exclude"]'); await ready();
  assert.ok(await evaluate(`![...document.querySelectorAll('.portfolio-list .roof-row')].some(el=>el.dataset.roofId===${JSON.stringify(excluded)})`));
  await click('[data-action="exclude"]'); await ready();
  await evaluate(`{ const original = URL.createObjectURL; URL.createObjectURL = blob => { globalThis.lastExport = blob; return original(blob); }; }`);
  await click('[data-action="export-csv"]');
  const csv = await evaluate('globalThis.lastExport.text()');
  assert.match(csv, /"Бюджет PLN";"1000000"/);
  assert.match(csv, /Принадлежность/);
  assert.equal(await evaluate(`document.querySelectorAll('.roof-evidence dl > div').length`), 6);
  assert.ok(await evaluate(`document.querySelector('.roof-evidence').textContent.includes('Владелец здания')`));
  await click('.rail [data-view="data"]');
  await click('[data-action="export-review"]');
  const reviewRu = await evaluate('globalThis.lastExport.text()');
  assert.match(reviewRu, /Категория собственности участка/);
  assert.equal((reviewRu.match(/_BUD/g) || []).length, 15);
  assert.ok(await evaluate(`document.querySelector('.review-status').textContent.includes('ожидают ручной проверки')`));
  await set('#language', 'pl');
  await click('[data-action="export-review"]');
  assert.match(await evaluate('globalThis.lastExport.text()'), /Kategoria własności działki/);
  await set('#language', 'ru');
  const reviewShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(path.join(output, 'review-data.png'), Buffer.from(reviewShot.data, 'base64'));
  await click('.rail [data-view="plan"]');
  await set('#language', 'pl');
  assert.equal(await evaluate('document.documentElement.lang'), 'pl');
  assert.ok(await evaluate('document.querySelector("h1").textContent.includes("Które dachy")'));
  await set('#language', 'ru');
  await click('.rail [data-view="data"]');
  await set('#roof-search', '126104_9.0012.1/4.1_BUD', 'input');
  assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'), 1);
  await click('.rail [data-view="method"]');
  assert.ok(await evaluate('document.querySelector("main").textContent.includes("Динамическое программирование")'));
  assert.ok(await evaluate(`document.querySelector('.source-explainer').textContent.includes('лазерному сканированию')`));
  await click('.rail [data-view="monitor"]');
  assert.ok(await evaluate(`document.querySelector('main').textContent.includes('Измерения пока не подключены')`));
  await click('[data-action="monitor-example"]');
  assert.ok(await evaluate(`document.querySelector('.monitor-record').textContent.includes('искусственные данные')`));
  assert.ok(await evaluate(`Boolean(document.querySelector('.power-chart polyline'))`));
  assert.equal(await evaluate(`document.querySelector('.financial-value').textContent`), '—');
  await click('[data-action="monitor-export"]');
  assert.equal(JSON.parse(await evaluate('globalThis.lastExport.text()')).mode, 'example');
  await set('#language', 'pl');
  assert.ok(await evaluate(`document.querySelector('.monitor-record').textContent.includes('dane sztuczne')`));
  await set('#language', 'ru');
  const monitorShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(path.join(output, 'monitoring-example.png'), Buffer.from(monitorShot.data, 'base64'));
  await evaluate(`{
    const record = { schemaVersion:1, mode:'recording', installation:{id:'qa-synthetic-fixture',name:'QA synthetic import',kind:'pv',measurementPoint:'ac-output',location:{latitude:50.05,longitude:19.95}},samples:[{timestamp:'2026-10-26T10:00:00Z',powerW:360000,selfConsumedPowerW:216000,exportPowerW:144000},{timestamp:'2026-10-26T10:00:10Z',powerW:360000,selfConsumedPowerW:216000,exportPowerW:144000}] };
    const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(record)],'qa.json',{type:'application/json'}));
    const input = document.querySelector('#measurement-file'); input.files = transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
  }`);
  await waitFor(`document.querySelector('.monitor-record h2').textContent.includes('QA synthetic import')`);
  await set('#monitor-buyRatePln', 1); await set('#monitor-sellRatePln', 0.3);
  assert.ok(await evaluate(`document.querySelector('.financial-value').textContent.includes('0,72')`));
  await click('[data-action="monitor-map"]');
  assert.ok(await evaluate(`Boolean(document.querySelector('[data-installation-id="qa-synthetic-fixture"]'))`));
  await evaluate(`document.querySelector('[data-installation-id="qa-synthetic-fixture"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  assert.ok(await evaluate(`Boolean(document.querySelector('.monitor-record'))`));
  await click('[data-action="monitor-clear"]');
  assert.ok(await evaluate(`document.querySelector('main').textContent.includes('Измерения пока не подключены')`));
  await click('.rail [data-view="plan"]');
  await click('[data-action="reset"]'); await ready();
  await evaluate(`{ const el = document.querySelector('[data-param="onlyGreen"]'); el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); }`);
  await ready();
  assert.ok(await evaluate(`document.querySelectorAll('.portfolio-list .roof-row').length > 0`));
  await click('[data-action="reset"]'); await ready();
  await click('[data-action="map-all"]');
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*://tile.openstreetmap.org/*'] });
  const offlineBox = await evaluate(`{ const r=document.querySelector('#city-map').getBoundingClientRect(); ({x:r.x+r.width*.5,y:r.y+r.height*.5}); }`);
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: offlineBox.x, y: offlineBox.y, deltaX: 0, deltaY: 2400 });
  await waitFor(`document.querySelector('#city-map').dataset.tiles === 'failed'`);
  await set('#budget', 0); await ready();
  assert.equal(await evaluate(`document.querySelectorAll('.portfolio-list .roof-row').length`), 0);
  if (!offline) await call('Network.setBlockedURLs', { urls: [] });
  await click('[data-action="reset"]'); await ready();
  await click('[data-action="map-all"]');
  if (!offline) await waitFor(`document.querySelectorAll('.leaflet-tile-loaded').length > 0`);
  await call('Emulation.setEmulatedMedia', { media: 'print' });
  assert.ok(await evaluate(`document.querySelector('.print-only').textContent.includes('4 996 560'.replaceAll(' ', '\u00a0')) || document.querySelector('.print-only').textContent.includes('4\u00a0996\u00a0560')`));
  const pdf = await call('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  await fs.writeFile(path.join(output, 'report.pdf'), Buffer.from(pdf.data, 'base64'));
  await call('Emulation.setEmulatedMedia', { media: 'screen' });
  const desktop = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(path.join(output, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(250);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile layout overflows.');
  const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(path.join(output, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  const report = { offline, initial, checks: [offline ? 'street tiles intentionally blocked' : 'street tiles', 'roof evidence statuses', '15-roof review CSV RU/PL', 'roof click and summary', 'wheel zoom', 'mouse drag', 'viewport preserved across recalculation', 'roof focus', 'zero budget', 'budget recalculation', 'exclude and restore', 'Russian CSV', 'RU/PL switch', 'data search', 'method view', 'green filter', 'offline basemap fallback', 'print report and PDF', 'mobile overflow'], runtimeErrors: errors };
  report.version = '0.4.0';
  report.checks.push('numerical forecast explanation', 'source methodology', 'monitoring empty state', 'explicit synthetic example and chart', 'monitoring RU/PL', 'recording export', 'measurement file import', 'separate self-use and export financial estimate', 'imported installation map marker', 'clear imported data');
  await fs.writeFile(path.join(output, 'browser-qa.json'), JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  processHandle.kill();
  await fs.writeFile(path.join(output, 'browser-stderr.log'), browserLogs.join(''));
}
