import { translate, LOCALES } from './i18n.js';
import { OWNERSHIP_SOURCE } from './core/review.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const drawings = {
  roof: '<path d="m3 12 9-8 9 8M6 10v10h12V10M9 20v-6h6v6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6Zm-10 12 10 6 10-6M2 12l10 6 10-6"/>',
  book: '<path d="M12 5v16M3 3c4 0 6 0 9 2 3-2 5-2 9-2v16c-4 0-6 0-9 2-3-2-5-2-9-2V3Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  wallet: '<path d="M3 6h17v15H3V6Zm0 0V3h14v3m-1 6h5v5h-5v-5Z"/>',
  chart: '<path d="M3 3v18h18M7 16l4-6 4 3 5-8"/>',
  sliders: '<path d="M6 3v6m0 4v8M18 3v10m0 4v4M3 9h6m6 4h6M10 3v18"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  print: '<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6v-7Z"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${drawings[name] || drawings.roof}</svg>`;
const shortId = id => id?.split('.').slice(-2).join('.').replace('_BUD', '') || '—';

export function createViews({ state, roofs, metadata, verification, geometry, benchmark, getCalculation, getMapLocation }) {
  const geometryIds = new Set(geometry?.features.map(f => f.properties.ident) || []);
  const t = (key, p) => translate(state.language, key, p);
  const fmt = (v, digits = 0) => Number(v).toLocaleString(LOCALES[state.language], { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const esc = escapeHtml;
  const million = value => t('million', { value: fmt(value / 1e6, 2) });
  const heading = (title, description, eyebrow = t('eyebrow')) => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-note"><span class="dot"></span>${t('pilotCount', { count: fmt(roofs.length) })}</div></div>`;
  const kpi = (label, value, unit, note, symbol, focus = false) => `<div class="kpi ${focus ? 'focus' : ''}"><div class="kpi-label">${label}${icon(symbol)}</div><div class="kpi-value">${value}<small>${unit}</small></div><div class="kpi-note">${note}</div></div>`;

  function parametersPanel() {
    const p = state.parameters;
    const field = (key, label, min, max, step = 1, value = p[key]) => `<div class="field"><label for="${key}">${label}</label><input class="small-input" type="number" id="${key}" data-param="${key}" value="${value}" min="${min}" max="${max}" step="${step}" required></div>`;
    return `<aside class="panel parameters-panel"><div class="panel-title"><h2>${icon('sliders')}${t('parameters')}</h2><span class="tag">PV</span></div><div class="parameters">
      <div class="field"><label for="budget">${t('budget')}</label><div class="money-input"><input id="budget" type="number" required value="${p.budgetPln / 1e6}" min="0" max="100" step="0.1" aria-describedby="budget-help"><span>${t('millionZl')}</span></div><input id="budget-range" type="range" min="0" max="30" step="0.1" value="${Math.min(30, p.budgetPln / 1e6)}" aria-label="${t('budgetRange')}"><div class="range-labels"><span>0 zł</span><span>${t('million', { value: 30 })} zł</span></div><p id="budget-help" class="field-help">${t('budgetHelp')}</p></div>
      <hr class="divider"><div class="param-section">${t('installationParams')}</div>
      ${field('costPerKwpPln', t('unitCost'), 100, 20000, 100)}
      <div class="field"><label for="coverage">${t('coverage')}<span id="coverage-value">${fmt(p.coverage * 100)}%</span></label><input id="coverage" type="range" data-param="coverage" min="10" max="100" step="5" value="${p.coverage * 100}"><p class="field-help">${t('coverageHelp')}</p></div>
      <details ${state.advanced ? 'open' : ''} id="advanced"><summary>${t('advanced')}</summary><div class="small-grid">${field('efficiency', t('efficiency'), 5, 35, 1, p.efficiency * 100)}${field('performanceRatio', t('pr'), 10, 100, 1, p.performanceRatio * 100)}</div>${field('fixedCostPln', t('fixedCost'), 0, 1000000, 1000)}${field('minCapacityKwp', t('minCapacity'), 0, 1000, 1)}<label class="check-label"><input type="checkbox" data-param="onlyGreen" ${p.onlyGreen ? 'checked' : ''}>${t('onlyGreen')}</label><label class="check-label"><input type="checkbox" data-param="omitInvestmentLabels" ${p.omitInvestmentLabels ? 'checked' : ''}>${t('omitInvestments')}</label><p class="field-help">${t('investmentHelp')}</p><p class="field-help">${t('parameterHelp')}</p></details>
      <div class="scenario-note">${icon('info')}<span>${t('screeningNote')}</span></div><button class="button" data-action="reset">${t('reset')}${state.excludedIds.length ? ' · ' + t('excludedCount', { count: state.excludedIds.length }) : ''}</button><div id="calculation-status" class="status-line ${state.error ? 'error' : ''}" role="status" aria-live="polite">${state.error ? t('calculationError') : state.busy ? t('calculating') : t('saved')}</div>
    </div></aside>`;
  }

  function roofRow(roof, index, chosen = false) {
    return `<button class="roof-row ${state.roofId === roof.id ? 'active' : ''}" data-roof-id="${esc(roof.id)}" aria-pressed="${state.roofId === roof.id}"><span class="roof-rank">${chosen ? index + 1 : icon('roof')}</span><span class="roof-info"><b>${t('roof', { id: esc(shortId(roof.id)) })}</b><small>${t('section', { section: roof.id.split('.')[1], code: roof.id.split('_')[0] })}</small></span><span class="roof-yield">${fmt(roof.annualEnergyKwh / 1000, 1)}<small>${t('mwhYear')}</small></span></button>`;
  }

  function mapPanel() {
    const { candidates, roofById } = getCalculation();
    const activeRoof = roofById.get(state.roofId);
    const summary = activeRoof ? `<div class="map-selected-summary"><div><strong>${t('roof', { id: esc(shortId(activeRoof.id)) })}</strong><span>${fmt(activeRoof.annualEnergyKwh / 1000, 1)} ${t('mwhYear')}</span></div><button class="button compact" data-action="show-details">${t('detail')} →</button></div>` : '';
    const sorted = state.mapMode === 'list' ? candidates.slice().sort((a, b) => b.annualEnergyKwh - a.annualEnergyKwh) : [];
    return `<section class="panel map-panel"><div class="panel-title"><h2>${icon('layers')}${t('mapTitle')}</h2><div class="view-switch" aria-label="${t('dataView')}">${['map', 'list'].map(id => `<button data-action="${id}" class="${state.mapMode === id ? 'active' : ''}" aria-pressed="${state.mapMode === id}">${t(id)}</button>`).join('')}</div></div>${state.mapMode === 'list' ? `<div class="full-list">${sorted.length ? sorted.map((r, i) => roofRow(r, i)).join('') : `<div class="empty">${t('noCandidates')}</div>`}</div>` : `<div class="map-actions"><div><button class="button compact" data-action="map-all">${t('allRoofs')}</button><button class="button compact" data-action="map-selected" ${state.result?.selectedIds.length ? '' : 'disabled'}>${t('selectedRoofs')}</button></div><span>${t('mapHelp')}</span></div><div class="map-wrap"><div class="map-host"></div><div class="map-label"><strong>${geometry ? t('mapLabel') : t('schematic')}</strong><span>${geometry ? t('mapGeometry', { count: geometry.features.length }) : t('schematicHelp')}</span></div><div class="map-network-status" role="status" hidden></div>${summary}</div>`}<div class="map-legend">${[['selected', 'selectedLegend'], ['', 'candidateLegend'], ['excluded', 'excludedLegend']].map(([style, key]) => `<span class="legend-item"><i class="${style}"></i>${t(key)}</span>`).join('')}</div><div class="map-caption"><span>${t('mapAttribution')}</span><span>${t('mapSource')}</span></div></section>`;
  }

  function analysisPanel() {
    const r = state.result;
    if (!r) return `<section class="panel"><div class="empty">${t('calculating')}</div></section>`;
    const max = Math.max(...r.alternatives.map(a => a.annualEnergyKwh), 1);
    const stable = r.selectedIds.filter(id => state.sensitivity.every(s => s.selectedIds.includes(id))).length;
    const scenarioLabels = { base: 'scenarioBase', cost: 'scenarioCost', yield: 'scenarioYield' };
    return `<section class="panel"><div class="panel-title"><h2>${icon('chart')}${t('comparison')}</h2><span class="tag">${r.improvementPercent > .05 ? t('gainBadge', { value: fmt(r.improvementPercent, 1) }) : t('threeStrategies')}</span></div><div class="analysis-content"><p class="analysis-subtitle">${t('comparisonHelp')}</p>${r.alternatives.map(a => `<div class="bar-row ${a.key === r.strategy ? 'current' : ''}"><span class="bar-name">${t(a.key)}</span><div class="bar-track"><div class="bar-fill" style="width:${100 * a.annualEnergyKwh / max}%"></div></div><strong>${fmt(a.annualEnergyKwh / 1000, 1)} ${t('mwh')}</strong></div>`).join('')}<details class="algorithm-note"><summary>${t('algorithmDetails')}</summary><p>${t('boundGap', { value: fmt(r.boundGapPercent, 2) })}<br>${t('roundingNote', { value: fmt(r.costStepPln, 2) })}</p><a href="#method" data-view="method">${t('howCalculated')}</a></details><h3 class="param-section">${t('sensitivity')}</h3><div class="sensitivity">${state.sensitivity.map(s => `<div class="scenario-card">${t(scenarioLabels[s.key])}<strong>${fmt(s.annualEnergyKwh / 1000)} <small>${t('mwhYear')}</small></strong><small>${t('scenarioRoofs', { count: s.count })}</small></div>`).join('')}</div><p class="stable-note">${t('stability', { stable, count: r.totals.count })}</p></div></section>`;
  }

  function evidencePanel(roof) {
    const matched = geometryIds.has(roof.id);
    return `<section class="roof-evidence" aria-label="${t('evidenceTitle')}"><h4>${t('evidenceTitle')}</h4><p>${t('inclusionBasis')}</p><dl>${[
      ['geometryEvidence', matched ? 'geometryInPackage' : 'noGeometry'],
      ['parcelEvidence', 'notChecked'], ['ownershipEvidence', 'notChecked'],
      ['addressEvidence', 'notChecked'], ['protectionEvidence', 'notChecked'], ['pvEvidence', 'notChecked'],
    ].map(([label, status]) => `<div><dt>${t(label)}</dt><dd class="${status === 'geometryInPackage' ? 'available' : ''}">${t(status)}</dd></div>`).join('')}</dl><p>${t('parcelLimit')}</p><a href="${OWNERSHIP_SOURCE.directoryUrl}" target="_blank" rel="noopener">${t('ownershipSourceLink')} ↗</a></section>`;
  }

  function reviewPanel() {
    return `<section class="panel review-panel"><div><h2>${t('reviewTitle')}</h2><p>${t('reviewHelp')}</p><p class="review-status">${t('reviewPending')}</p></div><button class="button" data-action="export-review" ${state.busy ? 'disabled' : ''}>${icon('download')}${t('reviewDownload')}</button></section>`;
  }

  function detailPanel() {
    const { roofById, reasons } = getCalculation();
    const roof = roofById.get(state.roofId);
    if (!roof) return '';
    const chosen = state.result?.selectedIds.includes(roof.id), excluded = state.excludedIds.includes(roof.id);
    const share = chosen && state.result.totals.annualEnergyKwh ? roof.annualEnergyKwh / state.result.totals.annualEnergyKwh * 100 : 0;
    const reasonKeys = { 'Wykluczenie użytkownika': 'excludedUser', 'Brak flagi zielonego dachu': 'excludedGreen', 'Filtr odnotowanych inwestycji': 'excludedInvestment', 'Moc poniżej progu scenariusza': 'excludedCapacity' };
    const reason = chosen ? t('selectedReason', { value: fmt(share, 1) }) : t(reasonKeys[reasons[roof.id]] || (roof.costPln > state.parameters.budgetPln ? 'tooExpensive' : 'notSelected'));
    const location = getMapLocation(roof.id);
    return `<div class="detail" id="roof-details"><div class="detail-heading"><span>${t('detail')}</span><span class="tag ${chosen ? '' : 'gray'}">${t(chosen ? 'inPlan' : 'outsidePlan')}</span></div><h3>${t('roof', { id: esc(shortId(roof.id)) })}</h3><p class="detail-id">${esc(roof.id)}</p><button class="button map-focus-button" data-action="focus-roof" data-id="${esc(roof.id)}">${icon('pin')}${t('showOnMap')}</button>${[
      [t('usableArea'), `${fmt(roof.usableAreaM2)} ${t('area')}`],
      [t('averageIrradiation'), `${fmt(roof.averageIrradiationKwhM2)} ${t('irradiationUnit')}`],
      [t('capacity'), `${fmt(roof.capacityKwp, 1)} ${t('kwp')}`],
      [t('roofEnergy'), `${fmt(roof.annualEnergyKwh / 1000, 1)} ${t('mwhYear')}`],
      [t('roofCost'), `${fmt(roof.costPln)} zł`],
      [t('roofRatio'), `${fmt(roof.kwhPerThousandPln)} ${t('kwhYear')}`],
    ].map(([label, value]) => `<div class="fact"><span>${label}</span><strong>${value}</strong></div>`).join('')}<div class="detail-reason">${reason}</div>${evidencePanel(roof)}<p class="detail-warnings">${roof.greenRoofPotential ? t('greenFlag') : ''}${roof.investmentLabel ? t('investmentFlag', { label: esc(roof.investmentLabel) }) : ''}${t('roofWarning')}</p>${location ? `<a class="location-link" href="${location.url}" target="_blank" rel="noopener">${t('openOsm')}</a>` : ''}<button class="button ${excluded ? '' : 'danger'}" data-action="exclude" data-id="${esc(roof.id)}">${t(excluded ? 'restore' : 'exclude')}${icon('arrow')}</button></div>`;
  }

  function portfolioPanel() {
    const { roofById } = getCalculation(), r = state.result;
    const chosen = r?.selectedIds.map(id => roofById.get(id)) || [];
    return `<aside class="panel portfolio"><div class="portfolio-head"><div class="eyebrow">${t('portfolioTitle')}</div><h2>${t('portfolioCount', { count: chosen.length })}</h2><p>${t('portfolioHelp')}</p></div><div class="portfolio-list">${chosen.length ? chosen.map((roof, i) => roofRow(roof, i, true)).join('') : `<div class="empty"><strong>${t(state.busy ? 'waiting' : 'emptyPlan')}</strong>${t(state.busy ? 'waitingHelp' : 'emptyPlanHelp')}</div>`}</div>${detailPanel()}<div class="portfolio-footer"><span>${t('remaining')}</span><strong>${fmt(r?.remainingPln || 0)} zł</strong></div></aside>`;
  }

  function printReport() {
    const { roofById } = getCalculation(), p = state.parameters, r = state.result;
    if (!r) return '';
    return `<section class="print-only"><h2>${t('reportTitle')}</h2><p>${t('reportTotals', { budget: fmt(p.budgetPln, 2), cost: fmt(r.totals.costPln, 2), remaining: fmt(r.remainingPln, 2), energy: fmt(r.totals.annualEnergyKwh / 1000, 2), unit: t('mwh') })}</p><table><thead><tr><th>${t('id')}</th><th>${t('powerHeading', { unit: t('kwp') })}</th><th>${t('energyHeading', { unit: t('mwhYear') })}</th><th>${t('costHeading')}</th></tr></thead><tbody>${r.selectedIds.map(id => { const roof = roofById.get(id); return `<tr><td>${esc(id)}</td><td>${fmt(roof.capacityKwp, 2)}</td><td>${fmt(roof.annualEnergyKwh / 1000, 2)}</td><td>${fmt(roof.costPln, 2)}</td></tr>`; }).join('')}</tbody></table><p>${t('reportParams', { coverage: fmt(p.coverage * 100), efficiency: fmt(p.efficiency * 100), pr: fmt(p.performanceRatio * 100), unitCost: fmt(p.costPerKwpPln), fixed: fmt(p.fixedCostPln), minimum: fmt(p.minCapacityKwp) })}</p><p>${t('reportFilters', { green: t(p.onlyGreen ? 'yes' : 'no'), investments: t(p.omitInvestmentLabels ? 'yes' : 'no'), ids: esc(state.excludedIds.join(', ') || t('none')) })}</p><p>${t('reportSource', { file: esc(metadata.referenceFile) })}</p><p>SHA256: ${metadata.referenceSha256}<br>${esc(metadata.sources[0].url)}</p></section>`;
  }

  function planView() {
    const { candidates } = getCalculation(), r = state.result;
    return `${heading(t('hero'), t('heroDescription'))}<ol class="workflow">${['step1', 'step2', 'step3'].map((key, i) => `<li><span>${i + 1}</span>${t(key)}</li>`).join('')}</ol><div class="kpis" aria-live="polite">${kpi(t('energy'), r ? fmt(r.totals.annualEnergyKwh / 1000) : '—', t('mwhYear'), t('energyNote'), 'sun', true)}${kpi(t('cost'), r ? million(r.totals.costPln) : '—', 'zł', t('budgetNote', { value: million(state.parameters.budgetPln) }), 'wallet')}${kpi(t('count'), r ? fmt(r.totals.count) : '—', '', t('candidates', { count: fmt(candidates.length) }), 'roof')}${kpi(t('gain'), r?.improvementPercent != null ? '+' + fmt(r.improvementPercent, 1) : '—', '%', t('gainNote'), 'chart')}</div><div class="planner">${parametersPanel()}<div class="center-stack">${mapPanel()}${analysisPanel()}</div>${portfolioPanel()}</div>${printReport()}`;
  }

  function dataView() {
    const { evaluated } = getCalculation();
    const visible = evaluated.filter(r => r.id.toLowerCase().includes(state.search.toLowerCase()) || r.investmentLabel?.toLowerCase().includes(state.search.toLowerCase()));
    const pageCount = Math.max(1, Math.ceil(visible.length / 20));
    state.page = Math.min(state.page, pageCount - 1);
    const selected = new Set(state.result?.selectedIds || []);
    return `${heading(t('dataTitle'), t('dataDescription'), t('dataEyebrow'))}<div class="notice">${t('dataNotice', { count: roofs.length })} ${verification ? t('geometryNotice', { count: verification.matchingReferenceIds }) : t('noGeometry')}</div>${reviewPanel()}<section class="panel"><div class="table-toolbar"><input id="roof-search" class="search-field" type="search" placeholder="${t('search')}" aria-label="${t('searchLabel')}" value="${esc(state.search)}"><span>${t('dataCounts', { count: visible.length, green: metadata.greenRoofPotential, investments: metadata.investmentLabels })}</span></div><div class="table-wrap"><table><thead><tr>${[t('id'), t('areaHeading'), t('irradiationHeading', { unit: t('irradiationUnit') }), t('greenHeading'), t('investmentHeading'), t('status')].map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${visible.slice(state.page * 20, (state.page + 1) * 20).map(r => `<tr><td><button data-roof-id="${esc(r.id)}" data-open-plan>${esc(shortId(r.id))}</button><div class="hash">${esc(r.id)}</div></td><td>${fmt(r.usableAreaM2)}</td><td>${fmt(r.averageIrradiationKwhM2)}</td><td>${r.greenRoofPotential ? `<span class="tag">${t('yes')}</span>` : t('noFlag')}</td><td>${esc(r.investmentLabel || t('noLabel'))}</td><td>${selected.has(r.id) ? `<span class="tag amber">${t('inPlan')}</span>` : t(state.excludedIds.includes(r.id) ? 'excluded' : 'candidate')}</td></tr>`).join('') || `<tr><td colspan="6">${t('noResults')}</td></tr>`}</tbody></table></div><div class="pagination"><button class="button compact" data-action="prev-page" ${state.page === 0 ? 'disabled' : ''}>${t('previous')}</button><span>${t('page', { page: state.page + 1, count: pageCount })}</span><button class="button compact" data-action="next-page" ${state.page >= pageCount - 1 ? 'disabled' : ''}>${t('next')}</button></div></section>`;
  }

  function methodView() {
    return `${heading(t('methodTitle'), t('methodDescription'), t('methodEyebrow'))}<div class="document-grid"><section class="panel document-section"><h2>${t('modelTitle')}</h2><p>${t('modelIntro')}</p><div class="formula">${t('formula').replaceAll('\n', '<br>')}</div><p>${t('modelLimits')}</p><h2>${t('selectionTitle')}</h2><p>${t('selectionIntro')}</p><ol>${['strategyLargest', 'strategyRatio', 'strategyDp'].map(key => `<li>${t(key)}</li>`).join('')}</ol><p>${t('selectionLimits')}</p><h3>${t('boundTitle')}</h3><p>${t('boundExplanation')}</p><h2>${t('sensitivityTitle')}</h2><p>${t('sensitivityExplanation')}</p><button class="button" data-action="export-json" ${state.busy ? 'disabled' : ''}>${icon('download')}${t('exportJson')}</button></section><div><section class="panel document-section"><h2>${t('provenance')}</h2><div class="quality-grid">${[[roofs.length, 'uniqueIds'], [verification?.matchingReferenceIds ?? '—', 'geometryMatches'], [metadata.greenRoofPotential, 'greenFlags'], [2016, 'atlasYear']].map(([value, key]) => `<div class="quality-tile"><b>${value}</b><span>${t(key)}</span></div>`).join('')}</div>${metadata.sources.map((s, i) => `<div class="source-entry"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a><p>${t('sourceRole' + i)}</p></div>`).join('')}<h3>${t('verificationTitle')}</h3><p>${verification ? t('verificationText', { official: fmt(verification.officialRecordCount), matched: verification.matchingReferenceIds, count: roofs.length, differences: verification.attributeDifferences.length, date: esc(verification.retrievedAt) }) : t('noGeometry')}</p><p>${t('sourceLimits')}</p><h3>${t('sourceHash')}</h3><p class="hash">SHA256 ${metadata.referenceSha256}</p></section><section class="panel document-section" style="margin-top:18px"><h2>${t('testedTitle')}</h2><p>${t('testedText')}</p>${benchmark ? `<p>${t('benchmarkText', { records: benchmark.referenceRecords, cases: benchmark.cases.length })}</p><a class="button compact" href="./data/benchmark.json" target="_blank" rel="noopener">${t('openBenchmark')}</a>` : ''}<p>${t('greenLimits')}</p></section></div></div>`;
  }

  return {
    t,
    html() {
      const active = state.view;
      return `<div class="shell ${state.busy ? 'calculating' : ''}"><nav class="rail" aria-label="${t('navigation')}"><div class="rail-logo" aria-hidden="true">${icon('roof')}</div>${[['plan', 'grid'], ['data', 'layers'], ['method', 'book']].map(([id, symbol]) => `<button data-view="${id}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${t(id)}</span></button>`).join('')}<div class="rail-foot">DACHY MIASTO / OPEN DATA</div></nav><div class="workspace"><header class="topbar"><div class="brand"><div class="brand-icon">${icon('roof')}</div><div><strong>Dachy Miasto</strong><small>${t('tagline')}</small></div></div><div class="top-actions"><span class="city-label">${icon('pin')}${t('city')}</span><label class="language-control"><span class="sr-only">${t('language')}</span><select id="language" aria-label="${t('language')}"><option value="ru" ${state.language === 'ru' ? 'selected' : ''}>RU</option><option value="pl" ${state.language === 'pl' ? 'selected' : ''}>PL</option></select></label><button class="button" data-action="print" ${state.busy ? 'disabled' : ''}>${icon('print')}<span class="button-label">${t('pdf')}</span><span class="button-short">PDF</span></button><button class="button primary" data-action="export-csv" ${state.busy || !state.result ? 'disabled' : ''}>${icon('download')}<span class="button-label">${t('csv')}</span><span class="button-short">CSV</span></button></div></header><main id="main">${active === 'data' ? dataView() : active === 'method' ? methodView() : planView()}<footer class="footer"><span>${t('footer')}</span><span>${t('footerLimits')} <button data-view="method">${t('sourcesLink')}</button></span></footer></main></div></div>`;
    },
  };
}
