const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const RUSSIAN = {
  'Scenariusz pilotażowy; własność i ograniczenia niezweryfikowane': 'Пилотный расчёт; принадлежность и ограничения не проверены',
  'Źródło': 'Источник', 'Data pierwotnego wyciągu': 'Дата первоначального среза', 'nieznana': 'неизвестна',
  'Budżet PLN': 'Бюджет PLN', 'Koszt wybranych PLN': 'Стоимость выбранных объектов PLN',
  'Pokrycie': 'Доля площади под панели', 'Sprawność': 'КПД', 'Współczynnik strat PR': 'Коэффициент потерь PR',
  'Koszt PLN/kWp': 'Стоимость PLN/кВтп', 'Koszt stały PLN/obiekt': 'Фиксированные затраты PLN/объект',
  'Minimalna moc kWp': 'Минимальная мощность кВтп', 'Tylko flaga zielonego dachu': 'Только потенциал озеленения',
  'Pomiń etykiety inwestycji': 'Исключать отмеченные инвестиции', 'Strategia': 'Способ подбора',
  'Krok kosztu PLN': 'Шаг округления затрат PLN', 'Luka do górnej granicy %': 'Разрыв до верхней границы %',
  'Wykluczone identyfikatory': 'Исключённые идентификаторы', 'Powierzchnia użyteczna m2': 'Полезная площадь м2',
  'Promieniowanie kWh/rok': 'Солнечное излучение кВт·ч/год', 'Moc kWp': 'Мощность кВтп',
  'Produkcja kWh/rok': 'Выработка кВт·ч/год', 'Koszt PLN': 'Стоимость PLN',
  'Flaga zielonego dachu': 'Потенциал озеленения', 'Etykieta inwestycji': 'Отметка об инвестиции',
  'Własność': 'Принадлежность', 'Ochrona': 'Охранный статус',
};
export function portfolioCsv(roofs, result, parameters, metadata, language = 'pl') {
  const label = value => language === 'ru' ? RUSSIAN[value] || value : value;
  const selected = new Map(roofs.map(r => [r.id, r]));
  const metadataRows = [
    ['Dachy Miasto', label('Scenariusz pilotażowy; własność i ograniczenia niezweryfikowane')],
    ['Źródło', metadata.referenceFile], ['SHA256', metadata.referenceSha256],
    ['Data pierwotnego wyciągu', metadata.snapshotDate || label('nieznana')],
    ['Budżet PLN', parameters.budgetPln], ['Koszt wybranych PLN', result.totals.costPln],
    ['Pokrycie', parameters.coverage], ['Sprawność', parameters.efficiency],
    ['Współczynnik strat PR', parameters.performanceRatio],
    ['Koszt PLN/kWp', parameters.costPerKwpPln], ['Koszt stały PLN/obiekt', parameters.fixedCostPln],
    ['Minimalna moc kWp', parameters.minCapacityKwp],
    ['Tylko flaga zielonego dachu', Boolean(parameters.onlyGreen)],
    ['Pomiń etykiety inwestycji', Boolean(parameters.omitInvestmentLabels)],
    ['Strategia', result.strategy], ['Krok kosztu PLN', result.costStepPln],
    ['Luka do górnej granicy %', result.boundGapPercent],
    ['Wykluczone identyfikatory', (parameters.excludedIds || []).join(' | ')],
  ];
  const headers = ['ID', 'Powierzchnia użyteczna m2', 'Promieniowanie kWh/rok', 'Moc kWp', 'Produkcja kWh/rok', 'Koszt PLN', 'Flaga zielonego dachu', 'Etykieta inwestycji', 'Własność', 'Ochrona'];
  const status = value => language === 'ru' ? ({ unverified: 'не проверено', unknown: 'неизвестно' }[value] || value) : value;
  const dataRows = result.selectedIds.map(id => {
    const r = selected.get(id);
    return [r.id, r.usableAreaM2, r.annualIrradiationKwh, r.capacityKwp.toFixed(3), r.annualEnergyKwh.toFixed(3), r.costPln.toFixed(2), r.greenRoofPotential, r.investmentLabel, status(r.ownershipStatus), status(r.protectionStatus)];
  });
  const rows = [...metadataRows.map(([key, value]) => [label(key), value]), [], headers.map(label), ...dataRows];
  return '\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n');
}
