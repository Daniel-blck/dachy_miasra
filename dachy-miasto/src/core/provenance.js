import { evaluateRoof } from './model.js';

// Source values stay separate from scenario assumptions and rounded pilot inputs.
export const SOLAR_LAYER = 'https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer/0';
export const CO2_SOURCE = 'https://www.kobize.pl/uploads/materialy/materialy_do_pobrania/aktualnosci/2025/142_Wskazniki_emisyjnosci_2025.pdf';
export const CALCULATION_METHOD = Object.freeze({
  version: 'roof-scenario-v2',
  areaInput: 'round(MSIP.powuzytecz), preserved from research HTML; not a surveyed module layout',
  nominalIrradianceKwM2: 1,
  potentialKwp: 'usableAreaM2 * coverage * efficiency * 1 kW/m2',
  capacityKwp: 'maxCapacityKwp > 0 ? min(potentialKwp, maxCapacityKwp) : potentialKwp',
  capacityScale: 'potentialKwp > 0 ? capacityKwp / potentialKwp : 0',
  panelAreaM2: 'usableAreaM2 * coverage * capacityScale',
  annualEnergyKwh: 'annualIrradiationKwh * coverage * efficiency * performanceRatio * capacityScale',
  specificYieldKwhPerKwp: 'annualEnergyKwh / capacityKwp = annualIrradiationKwh / usableAreaM2 * performanceRatio',
  costPln: 'round((capacityKwp * costPerKwpPln + fixedCostPln) * 100) / 100',
  co2Tonnes: 'annualEnergyKwh / 1000 * co2KgPerMwh / 1000; scenario displacement, not lifecycle assessment',
  costPerMwhPln: 'one-time costPln / (annualEnergyKwh / 1000); not LCOE or a sale price',
  limitation: 'Source area definition and current roof suitability need confirmation; historical radiation model, no measured production.',
});

export function roofCalculationTrace(roof, parameters, feature) {
  const evaluated = evaluateRoof(roof, parameters);
  return { source: solarEvidence(roof, feature), assumptions: { ...parameters },
    calculated: Object.fromEntries(['requestedPanelAreaM2', 'potentialKwp', 'capacityScale', 'effectiveCoverage', 'panelAreaM2', 'capacityKwp', 'annualEnergyKwh', 'specificYieldKwhPerKwp', 'costCents', 'costPln', 'co2Tonnes'].map(key => [key, evaluated[key]])),
    method: CALCULATION_METHOD.version };
}

export function solarRecordUrl(id) {
  const url = new URL(SOLAR_LAYER + '/query');
  for (const [key, value] of Object.entries({ where: `ident='${String(id).replaceAll("'", "''")}'`, outFields: 'ident,powbudynku,powuzytecz,sredniepc,sumapc', returnGeometry: 'false', f: 'pjson' })) url.searchParams.set(key, value);
  return url.href;
}

/** Ellipsoid-based local tangent plane, suitable for a small building, not a 3D roof survey. */
export function outlineAreaM2(geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!polygons.length) return null;
  const origin = polygons[0][0][0], lat = origin[1] * Math.PI / 180;
  const a = 6378137, e2 = 6.69437999014e-3, d = Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const east = a / d * Math.cos(lat) * Math.PI / 180;
  const north = a * (1 - e2) / d ** 3 * Math.PI / 180;
  const ringArea = ring => {
    const points = ring.map(([lon, latitude]) => [(lon - origin[0]) * east, (latitude - origin[1]) * north]);
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      sum += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(sum) / 2;
  };
  return polygons.reduce((sum, rings) => sum + rings.reduce((area, ring, i) => area + (i ? -1 : 1) * ringArea(ring), 0), 0);
}

export function solarEvidence(roof, feature) {
  const p = feature?.properties;
  return {
    id: roof.id,
    pilotAreaM2: roof.usableAreaM2,
    sourceUsefulAreaM2: p?.powuzytecz ?? null,
    sourceBuildingAreaM2: p?.powbudynku ?? null,
    outlineAreaM2: outlineAreaM2(feature?.geometry),
    areaRoundingDeltaM2: p ? roof.usableAreaM2 - p.powuzytecz : null,
    sourceAverageIrradiation: p?.sredniepc ?? null,
    sourceIncidentEnergy: p?.sumapc ?? null,
    // This ratio, rather than the rounded sredniepc field, determines E/P in our formula.
    effectiveIrradiationKwhM2: roof.annualIrradiationKwh / roof.usableAreaM2,
    sourceUrl: solarRecordUrl(roof.id),
  };
}

export function auditSolarData(roofs, geometry) {
  const features = geometry?.features || [];
  const byId = new Map(features.map(f => [f.properties.ident, f]));
  const rows = roofs.map(r => {
    const feature = byId.get(r.id), evidence = solarEvidence(r, feature), p = feature?.properties;
    return { ...evidence, areaMatches: Boolean(p) && Math.round(p.powuzytecz) === r.usableAreaM2,
      irradiationMatches: p?.sumapc === r.annualIrradiationKwh,
      averageMatches: p?.sredniepc === r.averageIrradiationKwhM2 };
  });
  const matched = rows.filter(r => r.sourceUsefulAreaM2 !== null);
  const ratios = matched.map(r => r.sourceUsefulAreaM2 / r.sourceBuildingAreaM2);
  const outlineErrors = matched.map(r => Math.abs(r.outlineAreaM2 / r.sourceBuildingAreaM2 - 1) * 100);
  return {
    records: roofs.length, features: features.length,
    duplicatePilotIds: roofs.length - new Set(roofs.map(r => r.id)).size,
    duplicateGeometryIds: features.length - byId.size,
    matched: matched.length,
    roundedAreaMatches: rows.filter(r => r.areaMatches).length,
    irradiationMatches: rows.filter(r => r.irradiationMatches).length,
    averageMatches: rows.filter(r => r.averageMatches).length,
    maxAreaRoundingDeltaM2: matched.length ? Math.max(...matched.map(r => Math.abs(r.areaRoundingDeltaM2))) : null,
    usefulToBuildingRatio: ratios.length ? { min: Math.min(...ratios), max: Math.max(...ratios) } : null,
    maxOutlineAreaDifferencePercent: outlineErrors.length ? Math.max(...outlineErrors) : null,
    mismatches: rows.filter(r => !r.areaMatches || !r.irradiationMatches || !r.averageMatches),
    largestRoofs: rows.toSorted((a, b) => b.pilotAreaM2 - a.pilotAreaM2).slice(0, 10),
  };
}
