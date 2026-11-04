import { pointInRing } from './geo.js';

export const LAYOUT_ASSUMPTIONS = Object.freeze({ panelLengthM: 2, panelWidthM: 1,
  moduleGapM: 0.05, setbackM: 0.5, buildingHeightM: 6,
  description: 'Conceptual flat-roof layout in the MSIP footprint. Height and setbacks are assumptions, not a surveyed design or compliance check. No obstacles or row shading supplied.' });

export function projectRoof(geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!polygons.length || !polygons[0]?.[0]?.length) throw new Error('Roof outline unavailable.');
  const points = polygons.flat(2);
  const origin = [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  const lat = origin[1] * Math.PI / 180, e2 = 6.69437999014e-3, a = 6378137;
  const d = Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const east = a / d * Math.cos(lat) * Math.PI / 180, north = a * (1 - e2) / d ** 3 * Math.PI / 180;
  const local = polygons.map(poly => poly.map(ring => ring.map(([lon, latitude]) => [(lon - origin[0]) * east, (latitude - origin[1]) * north])));
  return { polygons: local, origin };
}

const segmentDistance = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = dx * dx + dy * dy;
  const t = d ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function segmentsCross(a, b, c, d) {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

export function rectangleFits(corners, polygons, setback) {
  const poly = polygons.find(poly => corners.every(p => pointInRing(p, poly[0]) && !poly.slice(1).some(h => pointInRing(p, h))));
  if (!poly) return false;
  for (const ring of poly) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if (pointInRing(a, corners)) return false;
    for (let j = 0; j < corners.length; j++) {
      const p = corners[j], q = corners[(j + 1) % corners.length];
      if (segmentsCross(p, q, a, b) || Math.min(segmentDistance(p, a, b), segmentDistance(q, a, b), segmentDistance(a, p, q), segmentDistance(b, p, q)) < setback - 1e-7) return false;
    }
  }
  return true;
}

export function layoutPanels(roofPlane, settings, requestedCount) {
  const { polygons } = roofPlane, az = settings.azimuth * Math.PI / 180, tilt = settings.tilt * Math.PI / 180;
  const u = [Math.cos(az), -Math.sin(az)], v = [Math.sin(az), Math.cos(az)];
  const uv = ([x, y]) => [x * u[0] + y * u[1], x * v[0] + y * v[1]];
  const xy = (a, b) => [a * u[0] + b * v[0], a * u[1] + b * v[1]];
  const points = polygons.flat(2).map(uv);
  const minU = Math.min(...points.map(p => p[0])), maxU = Math.max(...points.map(p => p[0]));
  const minV = Math.min(...points.map(p => p[1])), maxV = Math.max(...points.map(p => p[1]));
  const width = LAYOUT_ASSUMPTIONS.panelWidthM, length = LAYOUT_ASSUMPTIONS.panelLengthM * Math.cos(tilt);
  const rise = LAYOUT_ASSUMPTIONS.panelLengthM * Math.sin(tilt), candidates = [];
  let iterations = 0;
  for (let b = minV + settings.setbackM; b + length <= maxV - settings.setbackM; b += length + settings.rowGapM) {
    for (let a = minU + settings.setbackM; a + width <= maxU - settings.setbackM; a += width + LAYOUT_ASSUMPTIONS.moduleGapM) {
      if (++iterations > 30000) throw new RangeError('Roof layout is too large.');
      const corners = [xy(a, b), xy(a + width, b), xy(a + width, b + length), xy(a, b + length)];
      if (rectangleFits(corners, polygons, settings.setbackM)) {
        const center = xy(a + width / 2, b + length / 2);
        candidates.push({ center, corners, vertices: corners.map(([x, y], i) => [x, y, i < 2 ? rise : 0]), distance: Math.hypot(...center) });
      }
    }
  }
  const panels = candidates.toSorted((a, b) => a.distance - b.distance).slice(0, Math.max(0, requestedCount));
  return { ...roofPlane, panels, availableSlots: candidates.length, requestedCount,
    panelAreaM2: panels.length * LAYOUT_ASSUMPTIONS.panelLengthM * LAYOUT_ASSUMPTIONS.panelWidthM,
    assumptions: { ...LAYOUT_ASSUMPTIONS, rowGapM: settings.rowGapM, setbackM: settings.setbackM } };
}
