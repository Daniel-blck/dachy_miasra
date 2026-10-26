// A review queue is a checklist, never evidence of municipal ownership.
export const OWNERSHIP_SOURCE = Object.freeze({
  name: 'MSIP · Struktura własności',
  directoryUrl: 'https://www.bip.krakow.pl/?bip_id=1&id=12838&metka=1',
  wmsUrl: 'https://msip.um.krakow.pl/arcgis/services/Obserwatorium/K01_GR_WLASNOSCI/MapServer/WMSServer',
  checkedOn: '2026-10-26',
  dataRetrieved: false,
});

const reasons = {
  selected: ['Выбран в текущем плане', 'Wybrany w bieżącym planie'],
  investment: ['Есть отметка об инвестиции', 'Etykieta inwestycji'],
  green: ['Есть потенциал озеленения', 'Potencjał zielonego dachu'],
  smallest: ['Минимальная полезная площадь', 'Najmniejsza powierzchnia użyteczna'],
  largest: ['Максимальная полезная площадь', 'Największa powierzchnia użyteczna'],
  district: ['Дополнительный кадастровый район', 'Dodatkowy obręb ewidencyjny'],
  coverage: ['Дополнение выборки', 'Uzupełnienie próby'],
};

/** Deterministic sample: selected roofs first, then flags, area extremes and districts. */
export function createReviewSample(roofs, selectedIds, geometry, limit = 15) {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('Invalid review limit.');
  const byId = new Map(roofs.map(r => [r.id, r]));
  const geometryById = new Map((geometry?.features || []).map(f => [f.properties.ident, f]));
  const sample = new Map();
  const sorted = roofs.slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const add = (roof, reason) => {
    if (!roof) return;
    if (sample.has(roof.id)) {
      if (!sample.get(roof.id).reasons.includes(reason)) sample.get(roof.id).reasons.push(reason);
    } else if (sample.size < limit) sample.set(roof.id, { roof, reasons: [reason] });
  };
  for (const id of selectedIds) add(byId.get(id), 'selected');
  for (const roof of sorted.filter(r => r.investmentLabel).slice(0, 3)) add(roof, 'investment');
  for (const roof of sorted.filter(r => r.greenRoofPotential).slice(0, 3)) add(roof, 'green');
  const areaSorted = sorted.slice().sort((a, b) => a.usableAreaM2 - b.usableAreaM2 || a.id.localeCompare(b.id, 'en'));
  add(areaSorted[0], 'smallest'); add(areaSorted.at(-1), 'largest');
  const district = roof => roof.id.split('.').slice(0, 2).join('.');
  const covered = new Set([...sample.values()].map(({ roof }) => district(roof)));
  for (const roof of sorted) if (!covered.has(district(roof))) { add(roof, 'district'); covered.add(district(roof)); }
  for (const roof of sorted) add(roof, 'coverage');
  return [...sample.values()].map(({ roof, reasons: selectedReasons }) => {
    const feature = geometryById.get(roof.id);
    const points = feature?.geometry?.type === 'Polygon' ? feature.geometry.coordinates.flat()
      : feature?.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates.flat(2) : [];
    const position = points.length ? {
      longitude: (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2,
      latitude: (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2,
      method: 'geometry-bounding-box-center',
    } : null;
    return {
      id: roof.id, reasons: selectedReasons.filter(reason => reason !== 'coverage' || selectedReasons.length === 1),
      usableAreaM2: roof.usableAreaM2, investmentLabel: roof.investmentLabel,
      greenRoofPotential: roof.greenRoofPotential, geometryAvailable: Boolean(feature), position,
      reviewStatus: 'pending', parcelId: null, parcelCategory: null,
      buildingOwner: null, address: null, protectionStatus: 'unknown', installedPv: 'unknown',
      evidenceUrl: null, checkedAt: null, reviewer: null, notes: null,
    };
  });
}

export function reviewCsv(sample, language = 'ru') {
  const pl = language === 'pl';
  const headers = pl
    ? ['ID dachu', 'Powód sprawdzenia', 'Powierzchnia użyteczna m2', 'Etykieta inwestycji', 'Flaga zielonego dachu', 'Geometria w pakiecie', 'Środek zasięgu geometrii — nie adres', 'Status sprawdzenia', 'ID działki', 'Kategoria własności działki', 'Właściciel budynku', 'Potwierdzony adres', 'Ochrona', 'Istniejąca PV', 'Źródło ustalenia', 'Data sprawdzenia', 'Sprawdzający', 'Uwagi']
    : ['ID крыши', 'Причина проверки', 'Полезная площадь м2', 'Отметка об инвестиции', 'Потенциал озеленения', 'Геометрия в пакете', 'Центр охвата геометрии — не адрес', 'Статус проверки', 'ID участка', 'Категория собственности участка', 'Владелец здания', 'Подтверждённый адрес', 'Охранный статус', 'Установленная PV', 'Источник подтверждения', 'Дата проверки', 'Проверил', 'Примечания'];
  const rows = sample.map(r => [
    r.id, r.reasons.map(key => reasons[key][pl ? 1 : 0]).join(' | '), r.usableAreaM2,
    r.investmentLabel, r.greenRoofPotential ? (pl ? 'tak' : 'да') : (pl ? 'brak flagi' : 'нет отметки'),
    r.geometryAvailable ? (pl ? 'tak' : 'да') : (pl ? 'nie' : 'нет'),
    r.position ? `https://www.openstreetmap.org/?mlat=${r.position.latitude.toFixed(6)}&mlon=${r.position.longitude.toFixed(6)}#map=18/${r.position.latitude.toFixed(6)}/${r.position.longitude.toFixed(6)}` : '',
    pl ? 'oczekuje' : 'ожидает проверки', '', '', '', '', pl ? 'nieznana' : 'неизвестно', pl ? 'nieznana' : 'неизвестно', '', '', '', '',
  ]);
  // Labels originate in an external dataset; prevent spreadsheet formula execution.
  const quote = value => `"${String(value ?? '').replace(/^[=+@\-\t\r\n]/, "'$&").replaceAll('"', '""')}"`;
  return '\uFEFF' + [headers, ...rows].map(row => row.map(quote).join(';')).join('\r\n');
}
