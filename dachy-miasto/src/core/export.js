import { DEFAULTS, describePortfolio } from './model.js';
import { heritageFlags, needsConservator } from './registers.js';
import { CALCULATION_METHOD, solarRecordUrl } from './provenance.js';

// Labels come from an external dataset; prevent spreadsheet formula execution, as in the review export.
const quote = value => `"${String(value ?? '').replace(/^[=+@\-\t\r\n]/, "'$&").replaceAll('"', '""')}"`;
const RUSSIAN = {
  'Scenariusz pilotażowy; własność i ograniczenia niezweryfikowane': 'Пилотный расчёт; принадлежность и ограничения не проверены',
  'Źródło': 'Источник', 'Stan danych źródłowych na dzień': 'Дата среза исходных данных', 'nieznana': 'неизвестна',
  'Budżet PLN': 'Бюджет PLN', 'Koszt wybranych PLN': 'Стоимость выбранных объектов PLN',
  'Pokrycie dachu modułami': 'Доля площади под панели', 'Sprawność modułów': 'КПД', 'Współczynnik sprawności systemu PR': 'Коэффициент потерь PR',
  'Koszt jednostkowy PLN/kWp': 'Стоимость PLN/кВтп', 'Koszt stały PLN/obiekt': 'Фиксированные затраты PLN/объект',
  'Minimalna moc kWp': 'Минимальная мощность кВтп', 'Tylko dachy z potencjałem zielonego dachu': 'Только потенциал озеленения',
  'Pomijanie dachów z wpisem o inwestycji': 'Исключать отмеченные инвестиции', 'Strategia doboru': 'Способ подбора',
  'Krok zaokrąglenia kosztów PLN': 'Шаг округления затрат PLN', 'Luka do górnej granicy %': 'Разрыв до верхней границы %',
  'Wykluczone identyfikatory': 'Исключённые идентификаторы', 'Powierzchnia użyteczna m2': 'Полезная площадь м2',
  'Roczne nasłonecznienie kWh/rok': 'Солнечное излучение кВт·ч/год', 'Moc kWp': 'Мощность кВтп',
  'Produkcja kWh/rok': 'Выработка кВт·ч/год', 'Koszt PLN': 'Стоимость PLN',
  'Potencjał zielonego dachu': 'Потенциал озеленения', 'Wpis o inwestycji': 'Отметка об инвестиции',
  'Własność budynku (weryfikacja)': 'Принадлежность здания (проверка)',
  'Limit mocy na budynek kWp (0 = bez limitu)': 'Предел мощности на здание кВтп (0 = без предела)',
  'Minimalny uzysk jednostkowy kWh/kWp': 'Мин. удельная выработка кВт·ч/кВтп',
  'Tylko działki miasta': 'Только участки города', 'Tylko budynki z aktualnej EGiB': 'Только здания из текущего EGiB',
  'Pomijanie obiektów z głównymi sygnałami ochrony': 'Исключать объекты с основными охранными сигналами',
  'Wskaźnik emisyjności CO2 kg CO2/MWh': 'Коэффициент выбросов CO2 кг CO2/МВт·ч', 'Produkcja wybranych kWh/rok': 'Выработка выбранных кВт·ч/год',
  'Uniknięta emisja t CO2/rok': 'Избегаемые выбросы т CO2/год', 'Nakłady PLN na 1 MWh/rok': 'Затраты PLN на 1 МВт·ч/год',
  'Dachy na działkach miasta': 'Крыши на участках города', 'Wymagają pozwolenia konserwatora': 'Нужно разрешение консерватора',
  'Adres (do weryfikacji)': 'Адрес (для проверки)', 'Sposób ustalenia adresu': 'Способ определения адреса',
  'Dzielnica': 'Район', 'Moc potencjalna kWp': 'Потенциальная мощность кВтп',
  'Uzysk jednostkowy kWh/kWp': 'Удельная выработка кВт·ч/кВтп', 'Procedura': 'Процедура',
  'Funkcja budynku (EGiB)': 'Назначение здания (EGiB)', 'Budynek w aktualnej EGiB': 'Здание в текущем EGiB',
  'Działka': 'Участок', 'Własność działki (MSIP)': 'Собственность участка (MSIP)',
  'Ochrona konserwatorska (MSIP)': 'Охрана памятников (MSIP)',
  'Miejski wykaz OZE': 'Городской перечень ВИЭ',
  'Metoda obliczeń': 'Метод расчёта',
  'Definicje liczb': 'Определения чисел',
  'Pole budynku MSIP m2': 'Площадь здания MSIP м2',
  'Pole użyteczne MSIP przed zaokrągleniem m2': 'Полезная площадь MSIP до округления м2',
  'Pole modułów po limicie m2': 'Площадь модулей после предела м2',
  'Efektywny udział pola użytecznego': 'Эффективная доля полезной площади',
  'Skala limitu mocy': 'Коэффициент уменьшения мощности',
  'Średnie promieniowanie MSIP kWh/m2/rok': 'Среднее излучение MSIP кВт·ч/м2/год',
  'Rekord źródłowy MSIP': 'Исходная запись MSIP',
  'Główne sygnały ochrony do sprawdzenia': 'Основные охранные сигналы для проверки',
};
const VALUES = {
  pl: { true: 'tak', false: 'nie', unverified: 'niezweryfikowana', unknown: 'nieznana', largest: 'Najpierw największa produkcja', ratio: 'Najwięcej energii na złotówkę', dp: 'Dobór zestawu (problem plecakowy)',
    inside: 'punkt w obrysie', nearest: 'najbliższy punkt w promieniu 30 m', small: 'do 6,5 kWp', micro: 'mikroinstalacja do 50 kWp', exempt: '50–150 kWp, bez pozwolenia na budowę', permit: 'powyżej 150 kWp, pozwolenie na budowę' },
  ru: { true: 'да', false: 'нет', unverified: 'не проверено', unknown: 'неизвестно', largest: 'По наибольшей выработке', ratio: 'По отдаче на злотый', dp: 'Подбор сочетания крыш',
    inside: 'точка внутри контура', nearest: 'ближайшая точка в пределах 30 м', small: 'до 6,5 кВтп', micro: 'микроустановка до 50 кВтп', exempt: '50–150 кВтп, без разрешения на строительство', permit: 'больше 150 кВтп, разрешение на строительство' },
};
const PROTECTION = {
  register: ['Rejestr zabytków', 'Реестр памятников'], urbanLayout: ['Układ urbanistyczny w rejestrze', 'Ансамбль в реестре'],
  culturalPark: ['Park kulturowy', 'Культурный парк'], unesco: ['Obszar UNESCO', 'Территория UNESCO'],
  inventory: ['Gminna ewidencja zabytków', 'Муниципальный перечень памятников'], heritageArea: ['Pomnik Historii', 'Pomnik Historii'],
  unescoBuffer: ['Strefa buforowa UNESCO', 'Буферная зона UNESCO'],
};
export function portfolioCsv(roofs, result, parameters, metadata, language = 'pl') {
  const label = value => language === 'ru' ? RUSSIAN[value] || value : value;
  const values = VALUES[language] || VALUES.pl;
  const value = raw => values[String(raw)] ?? raw;
  const selected = new Map(roofs.map(r => [r.id, r]));
  const plan = describePortfolio(result.selectedIds.map(id => selected.get(id)), { ...parameters, co2KgPerMwh: parameters.co2KgPerMwh ?? DEFAULTS.co2KgPerMwh });
  const number = (raw, digits) => Number.isFinite(raw) ? raw.toFixed(digits) : '';
  const hasRegisters = roofs.some(r => 'ownership' in r);
  const protection = r => heritageFlags(r).map(f => f.key === 'culturalPark' ? f.label : `${PROTECTION[f.key][language === 'ru' ? 1 : 0]}${f.label ? ` (${f.label})` : ''}`).join('; ');
  const metadataRows = [
    ['Dachy Miasta', label('Scenariusz pilotażowy; własność i ograniczenia niezweryfikowane')],
    ['Źródło', metadata.referenceFile], ['SHA256', metadata.referenceSha256],
    ['Stan danych źródłowych na dzień', metadata.snapshotDate || label('nieznana')],
    ['Metoda obliczeń', CALCULATION_METHOD.version],
    ['Definicje liczb', language === 'ru' ? 'DATA_SOURCES.md; поле полезной площади округлено в пилоте; затраты на МВт·ч/год не являются LCOE; коэффициент CO2 редактируется' : 'DATA_SOURCES.md; pole użyteczne zaokrąglone w pilotażu; nakłady na MWh/rok nie są LCOE; wskaźnik CO2 jest edytowalny'],
    ['Budżet PLN', parameters.budgetPln], ['Koszt wybranych PLN', result.totals.costPln],
    ['Pokrycie dachu modułami', parameters.coverage], ['Sprawność modułów', parameters.efficiency],
    ['Współczynnik sprawności systemu PR', parameters.performanceRatio],
    ['Koszt jednostkowy PLN/kWp', parameters.costPerKwpPln], ['Koszt stały PLN/obiekt', parameters.fixedCostPln],
    ['Minimalna moc kWp', parameters.minCapacityKwp],
    ['Limit mocy na budynek kWp (0 = bez limitu)', parameters.maxCapacityKwp ?? 0],
    ['Minimalny uzysk jednostkowy kWh/kWp', parameters.minSpecificYield ?? 0],
    ['Tylko działki miasta', value(Boolean(parameters.onlyCityLand))],
    ['Tylko budynki z aktualnej EGiB', value(Boolean(parameters.requireCurrentBuilding))],
    ['Pomijanie obiektów z głównymi sygnałami ochrony', value(Boolean(parameters.omitHeritage))],
    ['Tylko dachy z potencjałem zielonego dachu', value(Boolean(parameters.onlyGreen))],
    ['Pomijanie dachów z wpisem o inwestycji', value(Boolean(parameters.omitInvestmentLabels))],
    ['Wskaźnik emisyjności CO2 kg CO2/MWh', parameters.co2KgPerMwh ?? ''],
    ['Produkcja wybranych kWh/rok', number(plan.annualEnergyKwh, 0)],
    ['Uniknięta emisja t CO2/rok', number(plan.co2Tonnes, 1)],
    ['Nakłady PLN na 1 MWh/rok', number(plan.costPerMwhPln, 0)],
    ...(hasRegisters ? [['Dachy na działkach miasta', plan.cityLandCount], ['Główne sygnały ochrony do sprawdzenia', plan.heritageCount]] : []),
    ['Strategia doboru', value(result.strategy)], ['Krok zaokrąglenia kosztów PLN', result.costStepPln],
    ['Luka do górnej granicy %', number(result.boundGapPercent, 3)],
    ['Wykluczone identyfikatory', (parameters.excludedIds || []).join(' | ')],
  ];
  const headers = ['ID', 'Adres (do weryfikacji)', 'Sposób ustalenia adresu', 'Dzielnica', 'Funkcja budynku (EGiB)', 'Budynek w aktualnej EGiB', 'Działka', 'Własność działki (MSIP)', 'Ochrona konserwatorska (MSIP)', 'Główne sygnały ochrony do sprawdzenia', 'Miejski wykaz OZE', 'Powierzchnia użyteczna m2', 'Roczne nasłonecznienie kWh/rok', 'Moc potencjalna kWp', 'Moc kWp', 'Produkcja kWh/rok', 'Uzysk jednostkowy kWh/kWp', 'Uniknięta emisja t CO2/rok', 'Koszt PLN', 'Procedura', 'Potencjał zielonego dachu', 'Wpis o inwestycji', 'Własność budynku (weryfikacja)', 'Pole budynku MSIP m2', 'Pole użyteczne MSIP przed zaokrągleniem m2', 'Pole modułów po limicie m2', 'Efektywny udział pola użytecznego', 'Skala limitu mocy', 'Średnie promieniowanie MSIP kWh/m2/rok', 'Rekord źródłowy MSIP'];
  const dataRows = result.selectedIds.map(id => {
    const r = selected.get(id);
    return [r.id, r.address, r.addressMethod ? value(r.addressMethod) : '', r.district, r.buildingClass?.name, 'inEgib' in r ? value(r.inEgib) : '', r.ownership?.parcel, r.ownership?.description, protection(r), 'ownership' in r || 'culturalPark' in r ? value(needsConservator(r)) : '', (r.res || []).join(', '),
      r.usableAreaM2, r.annualIrradiationKwh, number(r.potentialKwp ?? r.capacityKwp, 3), r.capacityKwp.toFixed(3), r.annualEnergyKwh.toFixed(3), number(r.specificYieldKwhPerKwp, 0), number(r.co2Tonnes, 2), r.costPln.toFixed(2), r.procedure ? value(r.procedure) : '', value(Boolean(r.greenRoofPotential)), r.investmentLabel, value(r.ownershipStatus),
      number(r.solarSource?.powbudynku, 3), number(r.solarSource?.powuzytecz, 3), number(r.panelAreaM2, 3), number(r.effectiveCoverage, 6), number(r.capacityScale, 6), r.averageIrradiationKwhM2 ?? '', solarRecordUrl(r.id)];
  });
  const rows = [...metadataRows.map(([key, item]) => [label(key), item]), [], headers.map(label), ...dataRows];
  return '﻿' + rows.map(row => row.map(quote).join(';')).join('\r\n');
}
