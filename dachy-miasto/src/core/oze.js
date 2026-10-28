// Open municipal RES layer; it supplies locations, never live measurements.
export const OZE_SOURCE = Object.freeze({
  catalogUrl: 'https://msip.krakow.pl/dataset/2842',
  serviceUrl: 'https://msip.um.krakow.pl/arcgis/rest/services/JP/Instalacje_OZE_2023/MapServer',
  layer: '1', layerYear: 2024,
});
export function ozeTileUrl({ x, y, z }) {
  const extent = 20037508.342789244, width = 2 * extent / 2 ** z;
  const left = -extent + x * width, top = extent - y * width;
  const url = new URL(OZE_SOURCE.serviceUrl + '/export');
  for (const [key, value] of Object.entries({ f: 'image', bbox: [left, top - width, left + width, top].join(','), bboxSR: 3857, imageSR: 3857, size: '256,256', format: 'png32', transparent: true, layers: 'show:' + OZE_SOURCE.layer })) url.searchParams.set(key, String(value));
  return url.href;
}
