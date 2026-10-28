import { heritageFlags, needsConservator } from './registers.js';

// A review queue is a checklist, never evidence of municipal ownership.
export const OWNERSHIP_SOURCE = Object.freeze({
  name: 'MSIP · Struktura własności',
  directoryUrl: 'https://www.bip.krakow.pl/?bip_id=1&id=12838&metka=1',
  wmsUrl: 'https://msip.um.krakow.pl/arcgis/services/Obserwatorium/K01_GR_WLASNOSCI/MapServer/WMSServer',
  checkedOn: '2026-10-26',
  // Since 0.5 the ownership group of the parcel named in each building ID is read from this layer (scripts/fetch-registers.mjs).
  // It is a hint for review; the building owner and manager still need confirmation.
  dataRetrieved: true,
  restUrl: 'https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/K01_GR_WLASNOSCI/MapServer/0',
});

const reasons = {
  selected: ['Выбран в текущем плане', 'Wybrany w bieżącym planie'],
  investment: ['Есть отметка об инвестиции', 'Wpis o inwestycji'],
  heritage: ['Охранные сигналы требуют проверки', 'Sygnały ochrony wymagają sprawdzenia'],
  green: ['Есть потенциал озеленения', 'Potencjał zielonego dachu'],
  smallest: ['Минимальная полезная площадь', 'Najmniejsza powierzchnia użyteczna'],
  largest: ['Максимальная полезная площадь', 'Największa powierzchnia użyteczna'],
  district: ['Покрытие следующего кадастрового округа', 'Pokrycie kolejnego obrębu ewidencyjnego'],
  coverage: ['Дополнение выборки', 'Uzupełnienie próby'],
};

/** EGiB building IDs read unit.section.parcel.building_BUD, so the parcel ID is the first three parts. */
export function candidateParcel(id) {
  const parts = String(id ?? '').split('.');
  return parts.length === 4 && parts[3].endsWith('_BUD') ? parts.slice(0, 3).join('.') : null;
}

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
  for (const id of selectedIds) if (byId.get(id) && needsConservator(byId.get(id))) add(byId.get(id), 'heritage');
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
      // Hints from open data, still to be confirmed: the EGiB building ID embeds its parcel; the address is the nearest address point.
      candidateParcelId: candidateParcel(roof.id), candidateAddress: roof.address ?? null, addressMethod: roof.addressMethod ?? null,
      district: roof.district ?? null, culturalPark: roof.culturalPark ?? null,
      buildingClass: roof.buildingClass?.name ?? null, inEgib: roof.inEgib ?? null,
      ownershipHint: roof.ownership?.description ?? null, heritageHint: heritageFlags(roof).map(f => [f.key, f.label].filter(Boolean).join(': ')).join('; ') || null,
      resHint: roof.res?.length ? roof.res.join(', ') : null,
      buildingOwner: null, address: null, protectionStatus: 'unknown', installedPv: 'unknown',
      evidenceUrl: null, checkedAt: null, reviewer: null, notes: null,
    };
  });
}

export function reviewCsv(sample, language = 'ru') {
  const pl = language === 'pl';
  const headers = pl
    ? ['Identyfikator budynku', 'Powód sprawdzenia', 'Adres wstępny (z punktów adresowych)', 'Dzielnica', 'Park kulturowy', 'Działka wg identyfikatora budynku', 'Funkcja budynku (EGiB)', 'Własność działki — wstępnie (MSIP)', 'Ochrona — wstępnie (MSIP)', 'Miejski wykaz OZE', 'Powierzchnia użyteczna m2', 'Wpis o inwestycji', 'Potencjał zielonego dachu', 'Geometria w danych', 'Środek obrysu na mapie — nie adres', 'Status sprawdzenia', 'Numer działki', 'Grupa rejestrowa / forma własności działki', 'Właściciel budynku', 'Potwierdzony adres', 'Ochrona konserwatorska', 'Istniejąca instalacja PV', 'Źródło ustalenia', 'Data sprawdzenia', 'Sprawdzający', 'Uwagi']
    : ['ID крыши', 'Причина проверки', 'Адрес — кандидат по адресным точкам', 'Район', 'Культурный парк', 'Участок по идентификатору здания', 'Назначение здания (EGiB)', 'Собственность участка — предварительно (MSIP)', 'Охрана — предварительно (MSIP)', 'Городской перечень ВИЭ', 'Полезная площадь м2', 'Отметка об инвестиции', 'Потенциал озеленения', 'Геометрия в пакете', 'Центр охвата геометрии — не адрес', 'Статус проверки', 'ID участка', 'Категория собственности участка', 'Владелец здания', 'Подтверждённый адрес', 'Охранный статус', 'Установленная PV', 'Источник подтверждения', 'Дата проверки', 'Проверил', 'Примечания'];
  const rows = sample.map(r => [
    r.id, r.reasons.map(key => reasons[key][pl ? 1 : 0]).join(' | '),
    r.candidateAddress ? `${r.candidateAddress}${r.addressMethod === 'nearest' ? (pl ? ' (najbliższy punkt)' : ' (ближайшая точка)') : ''}` : '',
    r.district, r.culturalPark, r.candidateParcelId, r.buildingClass, r.ownershipHint, r.heritageHint, r.resHint, r.usableAreaM2,
    r.investmentLabel, r.greenRoofPotential ? (pl ? 'tak' : 'да') : (pl ? 'nie' : 'нет отметки'),
    r.geometryAvailable ? (pl ? 'tak' : 'да') : (pl ? 'nie' : 'нет'),
    r.position ? `https://www.openstreetmap.org/?mlat=${r.position.latitude.toFixed(6)}&mlon=${r.position.longitude.toFixed(6)}#map=18/${r.position.latitude.toFixed(6)}/${r.position.longitude.toFixed(6)}` : '',
    pl ? 'oczekuje na weryfikację' : 'ожидает проверки', '', '', '', '', pl ? 'nieznana' : 'неизвестно', pl ? 'nieznana' : 'неизвестно', '', '', '', '',
  ]);
  // Labels originate in an external dataset; prevent spreadsheet formula execution.
  const quote = value => `"${String(value ?? '').replace(/^[=+@\-\t\r\n]/, "'$&").replaceAll('"', '""')}"`;
  return '\uFEFF' + [headers, ...rows].map(row => row.map(quote).join(';')).join('\r\n');
}
