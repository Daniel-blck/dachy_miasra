import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const browser = process.env.QA_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const offline = process.argv.includes('--offline');
const output = fileURLToPath(new URL('../.preview/', import.meta.url));
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, 'chrome-'));
const processHandle = spawn(browser, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-extensions', '--disable-sync', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--window-size=1440,1050', 'http://127.0.0.1:4173/',
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
  // The default 150 kWp cap per building spreads 5 mln zł over ten roofs instead of six.
  assert.equal(initial.roofs, 10);
  assert.equal(await evaluate(`document.querySelectorAll('.rank-label').length`), 10);
  assert.ok(await evaluate(`document.querySelector('.kpis').textContent.includes('Na działkach miasta: 10')`));
  assert.equal(await evaluate(`document.querySelectorAll('.curve .curve-point').length`), 10);
  assert.ok(await evaluate(`document.querySelector('.plan-summary').textContent.includes('50–150 kWp')`));
  const polishText = await evaluate(`document.querySelector('main').innerText`);
  assert.doesNotMatch(polishText, /[А-Яа-яЁё]/, 'Polish view contains Cyrillic text.');
  assert.doesNotMatch(polishText, /\{\w+\}/);
  await click('[data-action="save-scenario"]');
  await set('#maxCapacityKwp', 0); await ready();
  // On city land only, removing the cap sends the budget to four buildings.
  assert.equal(await evaluate(`document.querySelectorAll('.portfolio-list .roof-row').length`), 4);
  assert.ok(await evaluate(`Boolean(document.querySelector('.plan-summary .warning-box'))`), 'Concentration warning is missing without a cap.');
  assert.equal(await evaluate(`document.querySelectorAll('.scenarios-panel tbody tr').length`), 2);
  await click('[data-action="remove-scenario"]');
  assert.equal(await evaluate(`document.querySelectorAll('.scenarios-panel tbody tr').length`), 1);
  await click('[data-action="reset"]'); await ready();
  // Polish is the default for the contest; the remaining checks run in Russian, the team's working language.
  assert.match(initial.geometry, /Kraków/);
  assert.equal(initial.language, 'pl');
  await click('[data-language="ru"]');
  assert.match(await evaluate(`document.querySelector('.map-label strong').textContent`), /Краков/);
  const clickedRoof = await evaluate(`{ const el=document.querySelector('#city-map [data-roof-id]'); const id=el.dataset.roofId; el.dispatchEvent(new MouseEvent('click',{bubbles:true})); id; }`);
  assert.equal(await evaluate(`document.querySelector('.detail-id').textContent`), clickedRoof);
  assert.ok(await evaluate(`document.querySelector('.map-selected-summary').textContent.includes(${JSON.stringify(clickedRoof.split('.')[2])})`));
  const mapBox = await evaluate(`{ document.querySelector('#city-map').scrollIntoView({ block: 'center' }); const r=document.querySelector('#city-map').getBoundingClientRect(); ({x:r.x+r.width*.65,y:r.y+r.height*.6}); }`);
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
  assert.equal(await evaluate(`document.querySelectorAll('.roof-evidence dl > div').length`), 7);
  assert.ok(await evaluate(`document.querySelector('.roof-evidence').textContent.includes('Владелец здания')`));
  await click('.main-nav [data-view="data"]');
  await click('[data-action="export-review"]');
  const reviewRu = await evaluate('globalThis.lastExport.text()');
  assert.match(reviewRu, /Категория собственности участка/);
  assert.equal((reviewRu.match(/_BUD/g) || []).length, 15);
  assert.ok(await evaluate(`document.querySelector('.review-status').textContent.includes('ожидают ручной проверки')`));
  await click('[data-language="pl"]');
  await click('[data-action="export-review"]');
  assert.match(await evaluate('globalThis.lastExport.text()'), /Grupa rejestrowa \/ forma własności działki/);
  await click('[data-language="ru"]');
  const reviewShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(path.join(output, 'review-data.png'), Buffer.from(reviewShot.data, 'base64'));
  await click('.main-nav [data-view="plan"]');
  await click('[data-language="pl"]');
  assert.equal(await evaluate('document.documentElement.lang'), 'pl');
  assert.ok(await evaluate('document.querySelector("h1").textContent.includes("Które dachy")'));
  await click('[data-language="ru"]');
  await click('.main-nav [data-view="data"]');
  await set('#roof-search', '126104_9.0012.1/4.1_BUD', 'input');
  assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'), 1);
  await set('#roof-search', '', 'input');
  await set('#data-filter', 'heritage');
  assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'), 25);
  assert.ok(await evaluate('[...document.querySelectorAll("tbody tr")].every(tr => /Реестр|Ансамбль|Парк|UNESCO/.test(tr.textContent))'));
  await click('[data-action="sort"][data-key="yield"]');
  const yields = await evaluate(String.raw`[...document.querySelectorAll("tbody tr")].map(tr => Number(tr.children[4].textContent.replace(/\s/g, "").replace(",", ".")))`);
  assert.ok(yields.every((value, i) => i === 0 || value <= yields[i - 1]), 'Yield sort is not descending.');
  await set('#data-filter', 'all');
  await click('.main-nav [data-view="method"]');
  assert.ok(await evaluate('document.querySelector("main").textContent.includes("Динамическое программирование")'));
  await click('.main-nav [data-view="plan"]');
  await click('[data-action="reset"]'); await ready();
  await evaluate(`{ const el = document.querySelector('[data-param="onlyGreen"]'); el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); }`);
  await ready();
  assert.ok(await evaluate(`document.querySelectorAll('.portfolio-list .roof-row').length > 0`));
  // Accessibility switches of the city portals: text size and the contrast version.
  await click('[data-action="font-size"][data-size="3"]');
  assert.equal(await evaluate('document.documentElement.dataset.size'), '3');
  assert.equal(await evaluate('getComputedStyle(document.documentElement).fontSize'), '20px');
  await click('[data-action="theme"][data-theme="contrast"]');
  assert.equal(await evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(0, 0, 0)');
  await click('[data-action="theme"][data-theme="basic"]');
  await click('[data-action="font-size"][data-size="1"]');
  assert.equal(await evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(255, 255, 255)');
  await click('[data-action="reset"]'); await ready();
  await click('[data-action="map-all"]');
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*://tile.openstreetmap.org/*'] });
  const offlineBox = await evaluate(`{ document.querySelector('#city-map').scrollIntoView({ block: 'center' }); const r=document.querySelector('#city-map').getBoundingClientRect(); ({x:r.x+r.width*.5,y:r.y+r.height*.5}); }`);
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: offlineBox.x, y: offlineBox.y, deltaX: 0, deltaY: 2400 });
  await waitFor(`document.querySelector('#city-map').dataset.tiles === 'failed'`);
  await set('#budget', 0); await ready();
  assert.equal(await evaluate(`document.querySelectorAll('.portfolio-list .roof-row').length`), 0);
  if (!offline) await call('Network.setBlockedURLs', { urls: [] });
  await click('[data-action="reset"]'); await ready();
  await click('[data-action="map-all"]');
  if (!offline) await waitFor(`document.querySelectorAll('.leaflet-tile-loaded').length > 0`);
  await call('Emulation.setEmulatedMedia', { media: 'print' });
  assert.ok(await evaluate(String.raw`/4\s993\s680/.test(document.querySelector('.report-bottom').textContent)`));
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
  const report = { offline, initial, checks: [offline ? 'street tiles intentionally blocked' : 'street tiles', 'Polish default without Cyrillic', 'text size and contrast version', 'budget curve', 'approval routes', 'saved variants', 'cap removal and concentration warning', 'roof evidence statuses', 'data filter and sort', '15-roof review CSV RU/PL', 'roof click and summary', 'wheel zoom', 'mouse drag', 'viewport preserved across recalculation', 'roof focus', 'zero budget', 'budget recalculation', 'exclude and restore', 'Russian CSV', 'RU/PL switch', 'data search', 'method view', 'green filter', 'offline basemap fallback', 'print report and PDF', 'mobile overflow'], runtimeErrors: errors };
  await fs.writeFile(path.join(output, 'browser-qa.json'), JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  processHandle.kill();
  await fs.writeFile(path.join(output, 'browser-stderr.log'), browserLogs.join(''));
}
