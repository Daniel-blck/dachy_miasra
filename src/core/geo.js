// Small geodesy helpers for joining municipal datasets to roof outlines. No external dependencies.
const A = 6378137, F = 1 / 298.257222101;

/** Inverse Transverse Mercator for EPSG:2178 (PL-2000 zone 7: λ0 = 21°, k0 = 0.999923, FE = 7 500 000 m, GRS80). */
export function inverse2178(easting, northing) {
  const k0 = 0.999923, lon0 = 21, falseEasting = 7_500_000;
  const n = F / (2 - F);
  const radius = A / (1 + n) * (1 + n ** 2 / 4 + n ** 4 / 64);
  const xi = northing / k0 / radius, eta = (easting - falseEasting) / k0 / radius;
  const beta = [n / 2 - 2 * n ** 2 / 3 + 37 * n ** 3 / 96, n ** 2 / 48 + n ** 3 / 15, 17 * n ** 3 / 480];
  let xi1 = xi, eta1 = eta;
  beta.forEach((b, j) => { const k = 2 * (j + 1); xi1 -= b * Math.sin(k * xi) * Math.cosh(k * eta); eta1 -= b * Math.cos(k * xi) * Math.sinh(k * eta); });
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  const delta = [2 * n - 2 * n ** 2 / 3 - 2 * n ** 3, 7 * n ** 2 / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];
  const latitude = chi + delta.reduce((sum, d, j) => sum + d * Math.sin(2 * (j + 1) * chi), 0);
  const longitude = Math.atan2(Math.sinh(eta1), Math.cos(xi1));
  return [lon0 + longitude * 180 / Math.PI, latitude * 180 / Math.PI];
}

/** Outer rings of a GeoJSON Polygon or MultiPolygon, as [[lon, lat], …]. */
export function outerRings(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map(polygon => polygon[0]);
  return [];
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const pointInRings = (point, rings) => rings.some(ring => pointInRing(point, ring));

/** Vertex average of the outer rings; adequate for small building outlines. */
export function centroid(rings) {
  const points = rings.flat();
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

/** Shortest distance in metres from a point to the edges of the rings (0 when the point lies inside). */
export function metresToRings(point, rings) {
  if (pointInRings(point, rings)) return 0;
  const k = Math.cos(point[1] * Math.PI / 180);
  const local = ([lon, lat]) => [(lon - point[0]) * 111_320 * k, (lat - point[1]) * 110_574];
  let best = Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = local(ring[i - 1]), [bx, by] = local(ring[i]);
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Local planar distance in metres; accurate to well under 1% at city scale. */
export function metresBetween([lon1, lat1], [lon2, lat2]) {
  const k = Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
  return Math.hypot((lon2 - lon1) * 111_320 * k, (lat2 - lat1) * 110_574);
}
