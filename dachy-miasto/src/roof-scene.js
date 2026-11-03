import { simulationSnapshot } from './core/simulation.js';
import { LAYOUT_ASSUMPTIONS } from './core/layout.js';
import { rowShadeFraction, PV_ASSUMPTIONS } from './core/climate.js';

const W = 900, H = 470;

/** SVG projection of the actual 2D footprint. Extrusion height is deliberately identified as an assumption. */
export function renderRoofScene(sim, { t, fmt, esc }) {
  const now = simulationSnapshot(sim), height = LAYOUT_ASSUMPTIONS.buildingHeightM;
  const yaw = sim.viewYaw * Math.PI / 180, pitch = sim.viewPitch * Math.PI / 180;
  const rotate = ([x, y, z = 0]) => [x * Math.cos(yaw) - y * Math.sin(yaw),
    -(x * Math.sin(yaw) + y * Math.cos(yaw)) * Math.sin(pitch) - z * Math.cos(pitch)];
  const bounds = sim.layout.polygons.flat(2).flatMap(([x, y]) => [rotate([x, y, 0]), rotate([x, y, height + 2])]);
  const minX = Math.min(...bounds.map(p => p[0])), maxX = Math.max(...bounds.map(p => p[0]));
  const minY = Math.min(...bounds.map(p => p[1])), maxY = Math.max(...bounds.map(p => p[1]));
  const scale = Math.min(700 / Math.max(1, maxX - minX), 270 / Math.max(1, maxY - minY));
  const project = point => { const [x, y] = rotate(point); return [W / 2 + (x - (minX + maxX) / 2) * scale, 262 + (y - (minY + maxY) / 2) * scale]; };
  const at = point => project(point).map(v => v.toFixed(2)).join(',');
  const path = (rings, z) => rings.map(r => 'M' + r.map(([x, y]) => at([x, y, z])).join('L') + 'Z').join('');
  const night = now.sun.elevation <= 0;
  const snowy = sim.snowPercent > 0 && PV_ASSUMPTIONS.snowMonths.includes(sim.month);
  const shadow = !night ? sim.layout.polygons.map(poly => {
    const shift = Math.min(15, height / Math.max(0.1, now.sun.up));
    const rings = poly.map(ring => ring.map(([x, y]) => [x - now.sun.east * shift, y - now.sun.north * shift]));
    return `<path d="${path(rings, 0)}" fill="#34435a" opacity=".16" fill-rule="evenodd"/>`;
  }).join('') : '';
  const walls = [];
  for (const poly of sim.layout.polygons) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
    const [a, b] = [ring[i - 1], ring[i]];
    walls.push({ depth: (rotate([...a, 0])[1] + rotate([...b, 0])[1]) / 2,
      html: `<polygon points="${at([...a, 0])} ${at([...b, 0])} ${at([...b, height])} ${at([...a, height])}" fill="#aebbc8" stroke="#8c9dad" stroke-width=".7"/>` });
  }
  const roof = sim.layout.polygons.map(poly => `<path d="${path(poly, height)}" fill="${snowy && sim.snowPercent > 60 ? '#f5f8fb' : '#d9e0e5'}" stroke="#60798e" stroke-width="1.5" fill-rule="evenodd"/>`).join('');
  // The row in front throws a strip of shadow over the low edge of the module behind it (same model as the energy).
  const rowShade = night ? 0 : rowShadeFraction(now.sun, sim.tilt, sim.azimuth, LAYOUT_ASSUMPTIONS.panelLengthM, sim.rows.pitchM);
  const occupied = new Set(sim.layout.panels.map(p => `${p.row}:${p.column}`));
  const lerp = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
  const panels = sim.layout.panels.toSorted((a, b) => rotate([...a.center, height])[1] - rotate([...b.center, height])[1]).map(panel => {
    const v = panel.vertices.map(([x, y, z]) => [x, y, z + height + 0.2]);
    const mid = (a, b) => a.map((x, i) => (x + b[i]) / 2);
    const strip = rowShade > 0.02 && occupied.has(`${panel.row + 1}:${panel.column}`) ? `<polygon points="${[v[3], v[2], lerp(v[2], v[1], rowShade), lerp(v[3], v[0], rowShade)].map(at).join(' ')}" fill="#0a1b2b" opacity=".5"/>` : '';
    return `<g class="pv-module"><polygon points="${v.map(at).join(' ')}" fill="${night ? '#284660' : '#0b5485'}" stroke="#c0dfed" stroke-width=".65"/><path d="M${at(mid(v[0], v[1]))}L${at(mid(v[2], v[3]))}M${at(mid(v[0], v[3]))}L${at(mid(v[1], v[2]))}" stroke="#83c7de" stroke-width=".35"/>${strip}${snowy ? `<polygon points="${v.map(at).join(' ')}" fill="#fff" opacity="${sim.snowPercent / 100}"/>` : ''}</g>`;
  }).join('');
  const north = rotate([0, 10, 0]), length = Math.hypot(...north);
  const nx = 60 + north[0] / length * 26, ny = 392 + north[1] / length * 26;
  const clouds = (sim.scenario === 'cloudy' ? [330, 520, 700, 840] : sim.scenario === 'typical' ? [560, 800] : []).map((x, i) => `<g transform="translate(${x} ${58 + i % 2 * 22})" fill="${night ? '#506274' : '#fff'}" opacity=".8"><ellipse rx="52" ry="13"/><circle cx="-19" cy="-9" r="17"/><circle cx="8" cy="-16" r="23"/><circle cx="29" cy="-6" r="15"/></g>`).join('');
  // The sun turns with the camera, like the building and its shadow.
  const horizontal = Math.hypot(now.sun.east, now.sun.north) || 1;
  const sunX = W / 2 + rotate([now.sun.east / horizontal, now.sun.north / horizontal, 0])[0] * 330;
  const bar = Math.min(150, scale * 10);
  return `<svg class="roof-scene" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('simSceneLabel'))}" data-panel-count="${sim.layout.panels.length}" data-tilt="${sim.tilt}" data-azimuth="${sim.azimuth}"><title>${esc(t('simSceneLabel'))}</title><defs><linearGradient id="scenario-sky" x2="0" y2="1"><stop stop-color="${night ? '#152b48' : sim.scenario === 'cloudy' ? '#becbd6' : '#b6dff2'}"/><stop offset="1" stop-color="${night ? '#405369' : '#eff6f9'}"/></linearGradient><marker id="north-head" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#0b5485"/></marker></defs><rect width="${W}" height="${H}" fill="url(#scenario-sky)"/>${!night ? `<circle cx="${sunX.toFixed(1)}" cy="${(100 - Math.min(70, now.sun.elevation)).toFixed(1)}" r="22" fill="#ffda6a"/>` : '<circle cx="800" cy="60" r="16" fill="#d6e5ee"/>'}${clouds}<ellipse cx="${W / 2}" cy="330" rx="400" ry="96" fill="${night ? '#75818a' : '#cbdccf'}" opacity=".65"/>${shadow}${walls.toSorted((a, b) => a.depth - b.depth).map(w => w.html).join('')}${roof}${panels}<g stroke="#0b5485" stroke-width="2"><path d="M60 392L${nx.toFixed(1)} ${ny.toFixed(1)}" marker-end="url(#north-head)"/><path d="M${W - 30 - bar} 420h${bar}m-${bar} -4v8m${bar} -8v8"/></g><g fill="${night ? '#fff' : '#163d56'}" font-size="14" font-family="Lato,Arial,sans-serif"><text x="${(nx - 5).toFixed(1)}" y="${(ny - 9).toFixed(1)}">N</text><text x="${W - 30 - bar}" y="408">${fmt(bar / scale, 1)} ${t('simMetres')}</text><text x="20" y="455" font-size="13">${esc(t('simSketchBadge'))} · ${esc(t('simSceneFootnote'))}</text></g></svg>`;
}
