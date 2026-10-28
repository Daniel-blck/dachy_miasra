import { simulationSnapshot } from './core/simulation.js';
import { LAYOUT_ASSUMPTIONS } from './core/layout.js';

/** SVG projection of the actual 2D footprint. Extrusion height is deliberately identified as an assumption. */
export function renderRoofScene(sim, { t, fmt, esc }) {
  const now = simulationSnapshot(sim), height = LAYOUT_ASSUMPTIONS.buildingHeightM;
  const yaw = sim.viewYaw * Math.PI / 180, pitch = sim.viewPitch * Math.PI / 180;
  const rotate = ([x, y, z = 0]) => [x * Math.cos(yaw) - y * Math.sin(yaw),
    -(x * Math.sin(yaw) + y * Math.cos(yaw)) * Math.sin(pitch) - z * Math.cos(pitch)];
  const bounds = sim.layout.polygons.flat(2).flatMap(([x, y]) => [rotate([x, y, 0]), rotate([x, y, height + 2])]);
  const minX = Math.min(...bounds.map(p => p[0])), maxX = Math.max(...bounds.map(p => p[0]));
  const minY = Math.min(...bounds.map(p => p[1])), maxY = Math.max(...bounds.map(p => p[1]));
  const scale = Math.min(710 / Math.max(1, maxX - minX), 310 / Math.max(1, maxY - minY));
  const project = point => { const [x, y] = rotate(point); return [450 + (x - (minX + maxX) / 2) * scale, 290 + (y - (minY + maxY) / 2) * scale]; };
  const at = point => project(point).map(v => v.toFixed(2)).join(',');
  const path = (rings, z) => rings.map(r => 'M' + r.map(([x, y]) => at([x, y, z])).join('L') + 'Z').join('');
  const night = now.sun.elevation <= 0;
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
  const roof = sim.layout.polygons.map(poly => `<path d="${path(poly, height)}" fill="${sim.snowPercent > 60 ? '#f5f8fb' : '#d9e0e5'}" stroke="#60798e" stroke-width="1.5" fill-rule="evenodd"/>`).join('');
  const panels = sim.layout.panels.toSorted((a, b) => rotate([...a.center, height])[1] - rotate([...b.center, height])[1]).map(panel => {
    const v = panel.vertices.map(([x, y, z]) => [x, y, z + height + 0.2]);
    const mid = (a, b) => a.map((x, i) => (x + b[i]) / 2);
    return `<g class="pv-module"><polygon points="${v.map(at).join(' ')}" fill="${night ? '#284660' : '#0b5485'}" stroke="#c0dfed" stroke-width=".65"/><path d="M${at(mid(v[0], v[1]))}L${at(mid(v[2], v[3]))}M${at(mid(v[0], v[3]))}L${at(mid(v[1], v[2]))}" stroke="#83c7de" stroke-width=".35"/>${sim.snowPercent ? `<polygon points="${v.map(at).join(' ')}" fill="#fff" opacity="${sim.snowPercent / 100}"/>` : ''}</g>`;
  }).join('');
  const north = rotate([0, 10, 0]), length = Math.hypot(...north);
  const nx = 72 + north[0] / length * 32, ny = 420 + north[1] / length * 32;
  const clouds = (sim.scenario === 'cloudy' ? [170, 350, 570, 750] : sim.scenario === 'typical' ? [190, 650] : []).map((x, i) => `<g transform="translate(${x} ${65 + i % 2 * 25})" fill="${night ? '#506274' : '#fff'}" opacity=".8"><ellipse rx="55" ry="14"/><circle cx="-20" cy="-10" r="18"/><circle cx="8" cy="-17" r="25"/><circle cx="30" cy="-6" r="16"/></g>`).join('');
  const sunX = 450 + Math.sin(now.sun.azimuth * Math.PI / 180) * 270;
  return `<svg class="roof-scene" viewBox="0 0 900 500" role="img" aria-label="${esc(t('simSceneLabel'))}" data-panel-count="${sim.layout.panels.length}" data-tilt="${sim.tilt}" data-azimuth="${sim.azimuth}"><title>${esc(t('simSceneLabel'))}</title><defs><linearGradient id="scenario-sky" x2="0" y2="1"><stop stop-color="${night ? '#152b48' : sim.scenario === 'cloudy' ? '#becbd6' : '#b6dff2'}"/><stop offset="1" stop-color="${night ? '#405369' : '#eff6f9'}"/></linearGradient><marker id="north-head" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#0b5485"/></marker></defs><rect width="900" height="500" fill="url(#scenario-sky)"/>${!night ? `<circle cx="${sunX}" cy="${105 - Math.min(70, now.sun.elevation)}" r="24" fill="#ffda6a"/>` : '<circle cx="730" cy="70" r="17" fill="#d6e5ee"/>'}${clouds}<ellipse cx="450" cy="365" rx="390" ry="100" fill="${night ? '#75818a' : '#cbdccf'}" opacity=".65"/>${shadow}${walls.toSorted((a, b) => a.depth - b.depth).map(w => w.html).join('')}${roof}${panels}<g stroke="#0b5485" stroke-width="2"><path d="M72 420L${nx} ${ny}" marker-end="url(#north-head)"/><path d="M680 445h${Math.min(160, scale * 10)}m-${Math.min(160, scale * 10)} -4v8m${Math.min(160, scale * 10)} -8v8"/></g><g fill="${night ? '#fff' : '#163d56'}" font-size="15" font-family="Lato,Arial,sans-serif"><text x="${nx - 5}" y="${ny - 10}">N</text><text x="680" y="432">${fmt(Math.min(160, scale * 10) / scale, 1)} ${t('simMetres')}</text><text x="24" y="32">${esc(t('simSketchBadge'))}</text><text x="24" y="475">${esc(t('simSceneFootnote'))}</text></g></svg>`;
}
