import { translate, LOCALES, roofLabel, roofPlace, roofParts } from './i18n.js';
import { OWNERSHIP_SOURCE } from './core/review.js';
import { describePortfolio, PROCEDURES } from './core/model.js';
import { CITY_GROUPS, heritageFlags, isCityLand, needsConservator } from './core/registers.js';

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
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7"/>',
  warn: '<path d="M12 3 2 21h20L12 3Zm0 7v5m0 3v.5"/>',
  save: '<path d="M5 3h11l3 3v15H5V3Zm3 0v6h7V3M8 21v-7h8v7"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${drawings[name] || drawings.roof}</svg>`;
const STATUS_ICON = { ok: '✓', partial: '≈', warn: '!', open: '○' };

export function createViews({ state, roofs, metadata, verification, geometry, benchmark, context, registers, pvgis, getCalculation, getMapLocation }) {
  const geometryIds = new Set(geometry?.features.map(f => f.properties.ident) || []);
  const t = (key, p) => translate(state.language, key, p);
  const fmt = (v, digits = 0) => Number(v).toLocaleString(LOCALES[state.language], { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const esc = escapeHtml;
  const million = value => t('million', { value: fmt(value / 1e6, 2) });
  const name = id => esc(roofLabel(state.language, id)), place = id => esc(roofPlace(state.language, id));
  const title = roof => roof.address ? esc(roof.address) : name(roof.id);
  const subtitle = roof => [roof.address ? name(roof.id) : place(roof.id), roof.district ? esc(roof.district) : ''].filter(Boolean).join(' · ');
  const capLabel = kwp => kwp > 0 ? t('capValue', { value: fmt(kwp) }) : t('capNone');
  const saved = () => state.saved || [];
  const ownerKey = roof => roof.ownership?.group || 'unknown';
  const protectionText = flag => t('protection_' + flag.key, { label: esc(flag.label || '') });
  const protectionTags = roof => heritageFlags(roof).map(f => `<span class="tag ${f.level === 'permit' ? 'amber' : 'gray'}" title="${protectionText(f)}">${t('protectionShort_' + f.key)}</span>`).join(' ');
  const warning = (text, soft = false) => `<div class="warning-box${soft ? ' soft' : ''}">${icon('warn')}<span>${text}</span></div>`;
  const horizontalPvgis = () => pvgis?.cases?.find(c => c.key === 'horizontal');
  const heading = (headline, description, eyebrow = t('eyebrow')) => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${headline}</h1><p>${description}</p></div><div class="heading-note"><span class="dot"></span>${t('pilotCount', { count: fmt(roofs.length) })}</div></div>`;
  const kpi = (label, value, unit, note, symbol, focus = false) => `<div class="kpi ${focus ? 'focus' : ''}"><div class="kpi-label">${label}${icon(symbol)}</div><div class="kpi-value">${value}<small>${unit}</small></div><div class="kpi-note">${note}</div></div>`;
  const planFacts = () => {
    const { roofById } = getCalculation();
    return state.result ? describePortfolio(state.result.selectedIds.map(id => roofById.get(id)).filter(Boolean), state.parameters) : null;
  };

  function parametersPanel() {
    const p = state.parameters;
    const field = (key, label, min, max, step = 1, value = p[key]) => `<div class="field"><label for="${key}">${label}</label><input class="small-input" type="number" id="${key}" data-param="${key}" value="${value}" min="${min}" max="${max}" step="${step}" required></div>`;
    const caps = [150, 50, 0].includes(p.maxCapacityKwp) ? [150, 50, 0] : [150, 50, 0, p.maxCapacityKwp];
    const capOption = value => value === 150 ? t('cap150') : value === 50 ? t('cap50') : value === 0 ? t('capNone') : capLabel(value);
    return `<aside class="panel parameters-panel"><div class="panel-title"><h2>${icon('sliders')}${t('parameters')}</h2><span class="tag">PV</span></div><div class="parameters">
      <div class="field"><label for="budget">${t('budget')}</label><div class="money-input"><input id="budget" type="number" required value="${p.budgetPln / 1e6}" min="0" max="100" step="0.1" aria-describedby="budget-help"><span>${t('millionZl')}</span></div><input id="budget-range" type="range" min="0" max="30" step="0.1" value="${Math.min(30, p.budgetPln / 1e6)}" aria-label="${t('budgetRange')}"><div class="range-labels"><span>0 zł</span><span>${t('million', { value: 30 })} zł</span></div><p id="budget-help" class="field-help">${t('budgetHelp')}</p></div>
      <div class="field field-wide"><label for="maxCapacityKwp">${t('maxCapacity')}</label><select id="maxCapacityKwp" data-param="maxCapacityKwp" class="small-input">${caps.map(value => `<option value="${value}" ${p.maxCapacityKwp === value ? 'selected' : ''}>${capOption(value)}</option>`).join('')}</select><p class="field-help">${t('maxCapacityHelp')}</p></div>
      <div class="field field-wide"><label class="check-label strong"><input type="checkbox" data-param="onlyCityLand" ${p.onlyCityLand ? 'checked' : ''} ${registers ? '' : 'disabled'}>${t('onlyCityLand')}</label><p class="field-help">${t(registers ? 'onlyCityLandHelp' : 'registersMissing')}</p></div>
      <hr class="divider"><div class="param-section">${t('installationParams')}</div>
      ${field('costPerKwpPln', t('unitCost'), 100, 20000, 100)}
      <div class="field"><label for="coverage">${t('coverage')}<span id="coverage-value">${fmt(p.coverage * 100)}%</span></label><input id="coverage" type="range" data-param="coverage" min="10" max="100" step="5" value="${p.coverage * 100}"><p class="field-help">${t('coverageHelp')}</p></div>
      <details ${state.advanced ? 'open' : ''} id="advanced"><summary>${t('advanced')}</summary><div class="small-grid">${field('efficiency', t('efficiency'), 5, 35, 1, p.efficiency * 100)}${field('performanceRatio', t('pr'), 10, 100, 1, p.performanceRatio * 100)}</div>${field('fixedCostPln', t('fixedCost'), 0, 1000000, 1000)}<div class="small-grid">${field('minCapacityKwp', t('minCapacity'), 0, 1000, 1)}${field('minSpecificYield', t('minYield'), 0, 1500, 50)}</div><p class="field-help">${t('minYieldHelp')}</p>${field('co2KgPerMwh', t('co2Factor'), 0, 1500, 1)}<p class="field-help">${t('co2FactorHelp')}</p><label class="check-label"><input type="checkbox" data-param="requireCurrentBuilding" ${p.requireCurrentBuilding ? 'checked' : ''} ${registers ? '' : 'disabled'}>${t('requireCurrentBuilding')}</label><label class="check-label"><input type="checkbox" data-param="omitHeritage" ${p.omitHeritage ? 'checked' : ''}>${t('omitHeritage')}</label><label class="check-label"><input type="checkbox" data-param="onlyGreen" ${p.onlyGreen ? 'checked' : ''}>${t('onlyGreen')}</label><label class="check-label"><input type="checkbox" data-param="omitInvestmentLabels" ${p.omitInvestmentLabels ? 'checked' : ''}>${t('omitInvestments')}</label><p class="field-help">${t('investmentHelp')}</p><p class="field-help">${t('parameterHelp')}</p></details>
      <div class="scenario-note">${icon('info')}<span>${t('screeningNote')}</span></div><button class="button" data-action="reset">${t('reset')}${state.excludedIds.length ? ' · ' + t('excludedCount', { count: state.excludedIds.length }) : ''}</button><div id="calculation-status" class="status-line ${state.error ? 'error' : ''}" role="status" aria-live="polite">${state.error ? t('calculationError') : state.busy ? t('calculating') : t('saved')}</div>
    </div></aside>`;
  }

  function roofRow(roof, index, chosen = false) {
    const flags = `${roof.capped ? `<i>${t('cappedShort', { value: fmt(roof.capacityKwp) })}</i>` : ''}${heritageFlags(roof).slice(0, 1).map(f => `<i class="${f.level === 'permit' ? 'warn' : ''}">${t('protectionShort_' + f.key)}</i>`).join('')}`;
    return `<button class="roof-row ${state.roofId === roof.id ? 'active' : ''}" data-roof-id="${esc(roof.id)}" aria-pressed="${state.roofId === roof.id}"><span class="roof-rank">${chosen ? index + 1 : icon('roof')}</span><span class="roof-info"><b>${title(roof)}</b><small>${subtitle(roof)}</small>${flags ? `<span class="row-flags">${flags}</span>` : ''}</span><span class="roof-yield">${fmt(roof.annualEnergyKwh / 1000, 1)}<small>${t('mwhYear')}</small></span></button>`;
  }

  function mapPanel() {
    const { candidates, roofById } = getCalculation();
    const activeRoof = roofById.get(state.roofId);
    const summary = activeRoof ? `<div class="map-selected-summary"><div><strong>${title(activeRoof)}</strong><span>${fmt(activeRoof.annualEnergyKwh / 1000, 1)} ${t('mwhYear')} · ${name(activeRoof.id)}</span></div><button class="button compact" data-action="show-details">${t('detail')} →</button></div>` : '';
    const sorted = state.mapMode === 'list' ? candidates.slice().sort((a, b) => b.annualEnergyKwh - a.annualEnergyKwh) : [];
    return `<section class="panel map-panel"><div class="panel-title"><h2>${icon('layers')}${t('mapTitle')}</h2><div class="view-switch" aria-label="${t('dataView')}">${['map', 'list'].map(id => `<button data-action="${id}" class="${state.mapMode === id ? 'active' : ''}" aria-pressed="${state.mapMode === id}">${t(id)}</button>`).join('')}</div></div>${state.mapMode === 'list' ? `<div class="full-list">${sorted.length ? sorted.map((r, i) => roofRow(r, i)).join('') : `<div class="empty">${t('noCandidates')}</div>`}</div>` : `<div class="map-actions"><div><button class="button compact" data-action="map-all">${t('allRoofs')}</button><button class="button compact" data-action="map-selected" ${state.result?.selectedIds.length ? '' : 'disabled'}>${t('selectedRoofs')}</button></div><span>${t('mapHelp')}</span></div><div class="map-wrap"><div class="map-host"></div><div class="map-label"><strong>${geometry ? t('mapLabel') : t('schematic')}</strong><span>${geometry ? t('mapGeometry', { count: geometry.features.length }) : t('schematicHelp')}</span></div><div class="map-network-status" role="status" hidden></div>${summary}</div>`}<div class="map-legend">${[['selected', 'selectedLegend'], ['', 'candidateLegend']].map(([style, key]) => `<span class="legend-item"><i class="${style}"></i>${t(key)}</span>`).join('')}<label class="legend-item legend-toggle"><input type="checkbox" id="show-outside" ${state.showOutside ? 'checked' : ''}><i class="excluded"></i>${t('hideOutside')}</label></div><div class="map-caption"><span>${t('mapAttribution')}</span><span>${t('mapSource')}</span></div></section>`;
  }

  /** Single-series line: annual production for each budget under the current assumptions. */
  function curveChart() {
    const curve = state.curve || [];
    if (curve.length < 2) return '';
    const W = 560, H = 210, L = 52, R = 18, T = 22, B = 38;
    const maxX = Math.max(...curve.map(c => c.budgetPln)), maxY = Math.max(...curve.map(c => c.annualEnergyKwh), 1);
    const x = v => L + (W - L - R) * v / maxX, y = v => H - B - (H - T - B) * v / maxY;
    const topMwh = maxY / 1000, step = [100, 200, 500, 1000, 2000, 5000].find(s => topMwh / s <= 5) || 10000;
    const ticksY = Array.from({ length: Math.floor(topMwh / step) + 1 }, (_, i) => i * step);
    const ticksX = curve.map(c => c.budgetPln).filter(b => [1, 5, 10, 15, 20, 30].includes(b / 1e6));
    const current = curve.find(c => Math.abs(c.budgetPln - state.parameters.budgetPln) < 1);
    const path = curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.budgetPln).toFixed(1)},${y(c.annualEnergyKwh).toFixed(1)}`).join('');
    const tip = c => t('curveTooltip', { budget: fmt(c.budgetPln / 1e6, 1), energy: fmt(c.annualEnergyKwh / 1000), count: c.count });
    const below = curve.filter(c => c.budgetPln <= state.parameters.budgetPln).at(-1), above = curve.find(c => c.budgetPln >= state.parameters.budgetPln * 1.5);
    const marginal = below && above ? t('curveMarginal', { from: fmt(below.budgetPln / 1e6, 1), to: fmt(above.budgetPln / 1e6, 1), value: fmt((above.annualEnergyKwh - below.annualEnergyKwh) / 1000 / ((above.budgetPln - below.budgetPln) / 1e6)), average: fmt(below.annualEnergyKwh / 1000 / (below.budgetPln / 1e6)) }) : '';
    return `<h3 class="param-section">${t('curveTitle')}</h3><figure class="curve"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('curveTitle')}">${ticksY.map(v => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v * 1000)}" y2="${y(v * 1000)}"/><text class="axis-label" x="${L - 8}" y="${y(v * 1000) + 4}" text-anchor="end">${fmt(v)}</text>`).join('')}${ticksX.map(b => `<text class="axis-label" x="${x(b)}" y="${H - B + 18}" text-anchor="middle">${fmt(b / 1e6)}</text>`).join('')}<text class="axis-label" x="${W - R}" y="${H - 3}" text-anchor="end">${t('curveAxisX')}</text><text class="axis-label" x="0" y="${T - 9}">${t('mwhYear')}</text><path class="curve-line" d="${path}"/>${curve.map(c => `<g class="curve-point${c === current ? ' current' : ''}"><circle class="dot" cx="${x(c.budgetPln)}" cy="${y(c.annualEnergyKwh)}" r="${c === current ? 6 : 4}"/><circle class="hit" cx="${x(c.budgetPln)}" cy="${y(c.annualEnergyKwh)}" r="13"><title>${tip(c)}</title></circle></g>`).join('')}${current ? `<text class="curve-label" x="${x(current.budgetPln) + (x(current.budgetPln) > W * 0.7 ? -10 : 10)}" y="${y(current.annualEnergyKwh) + 22}" text-anchor="${x(current.budgetPln) > W * 0.7 ? 'end' : 'start'}">${t('curveCurrent', { value: fmt(current.annualEnergyKwh / 1000) })}</text>` : ''}</svg><figcaption>${marginal}</figcaption></figure><details class="algorithm-note"><summary>${t('curveTable')}</summary><table class="mini-table"><thead><tr><th>${t('budget')}</th><th>${t('energyHeading', { unit: t('mwhYear') })}</th><th>${t('count')}</th></tr></thead><tbody>${curve.map(c => `<tr><td>${fmt(c.budgetPln / 1e6, 1)} ${t('millionZl')}</td><td>${fmt(c.annualEnergyKwh / 1000)}</td><td>${c.count}</td></tr>`).join('')}</tbody></table></details>`;
  }

  function analysisPanel() {
    const r = state.result;
    if (!r) return `<section class="panel"><div class="empty">${t('calculating')}</div></section>`;
    const max = Math.max(...r.alternatives.map(a => a.annualEnergyKwh), 1);
    const stable = r.selectedIds.filter(id => state.sensitivity.every(s => s.selectedIds.includes(id))).length;
    const scenarioLabels = { base: 'scenarioBase', cost: 'scenarioCost', yield: 'scenarioYield' };
    return `<section class="panel"><div class="panel-title"><h2>${icon('chart')}${t('comparison')}</h2><span class="tag">${r.improvementPercent > .05 ? t('gainBadge', { value: fmt(r.improvementPercent, 1) }) : t('threeStrategies')}</span></div><div class="analysis-content"><p class="analysis-subtitle">${t('comparisonHelp')}</p>${r.alternatives.map(a => `<div class="bar-row ${a.key === r.strategy ? 'current' : ''}"><span class="bar-name">${t(a.key)}</span><div class="bar-track"><div class="bar-fill" style="width:${100 * a.annualEnergyKwh / max}%"></div></div><strong>${fmt(a.annualEnergyKwh / 1000, 1)} ${t('mwh')}</strong></div>`).join('')}<details class="algorithm-note"><summary>${t('algorithmDetails')}</summary><p>${t('gainExplained', { value: fmt(r.improvementPercent ?? 0, 1) })}<br>${t('boundGap', { value: fmt(r.boundGapPercent, 2) })}<br>${t('roundingNote', { value: fmt(r.costStepPln, 2) })}</p><a href="#method" data-view="method">${t('howCalculated')}</a></details>${curveChart()}<h3 class="param-section">${t('sensitivity')}</h3><div class="sensitivity">${state.sensitivity.map(s => `<div class="scenario-card">${t(scenarioLabels[s.key])}<strong>${fmt(s.annualEnergyKwh / 1000)} <small>${t('mwhYear')}</small></strong><small>${t('scenarioRoofs', { count: s.count })}</small></div>`).join('')}</div><p class="stable-note">${t('stability', { stable, count: r.totals.count })}</p></div></section>`;
  }

  function scenariosPanel() {
    const facts = planFacts();
    const p = state.parameters;
    const now = facts ? { budgetPln: p.budgetPln, maxCapacityKwp: p.maxCapacityKwp, count: facts.count, energyMwh: facts.annualEnergyKwh / 1000, co2Tonnes: facts.co2Tonnes, costPerMwhPln: facts.costPerMwhPln, procedures: facts.procedures } : null;
    const row = (label, s, current = false, index = -1) => `<tr class="${current ? 'current' : ''}"><th scope="row">${esc(label)}</th><td>${fmt(s.budgetPln / 1e6, 1)} ${t('millionZl')}</td><td>${capLabel(s.maxCapacityKwp)}</td><td>${fmt(s.count)}</td><td>${fmt(s.energyMwh)}</td><td>${fmt(s.co2Tonnes)}</td><td>${s.costPerMwhPln ? fmt(s.costPerMwhPln) : '—'}</td><td>${PROCEDURES.map(x => s.procedures[x.key] ?? 0).join(' / ')}</td><td>${current ? '' : `<button class="link-button" data-action="remove-scenario" data-index="${index}" aria-label="${t('removeVariant', { label: esc(label) })}">${t('remove')}</button>`}</td></tr>`;
    return `<section class="panel scenarios-panel"><div class="panel-title"><h2>${icon('save')}${t('savedTitle')}</h2><button class="button compact" data-action="save-scenario" ${state.busy || !now || saved().length >= 4 ? 'disabled' : ''}>${t('saveVariant')}</button></div><div class="analysis-content"><p class="analysis-subtitle">${t(saved().length >= 4 ? 'savedLimit' : 'savedHelp')}</p><div class="table-wrap"><table class="mini-table"><thead><tr><th>${t('variant')}</th><th>${t('colBudget')}</th><th>${t('colCap')}</th><th>${t('colRoofs')}</th><th>${t('mwhYear')}</th><th>${t('co2Unit')}</th><th>${t('costPerMwhHeading')}</th><th>${t('proceduresHeading')}</th><th><span class="sr-only">${t('remove')}</span></th></tr></thead><tbody>${now ? row(t('currentVariant'), now, true) : ''}${saved().map((s, i) => row(s.label, s, false, i)).join('')}</tbody></table></div><p class="field-help">${t('proceduresLegend')}</p></div></section>`;
  }

  function checklist(roof) {
    const hasRegisters = 'ownership' in roof, hasContext = 'culturalPark' in roof;
    const parts = roofParts(roof.id), flags = heritageFlags(roof), owner = ownerKey(roof);
    const rows = [
      ['geometryEvidence', geometryIds.has(roof.id) ? ['ok', t('geometryInPackage')] : ['open', t('noGeometry')]],
      ['egibEvidence', !('inEgib' in roof) ? ['open', t('notChecked')] : roof.inEgib ? ['ok', t('egibPresent', { date: esc(registers?.currency?.egib || '—') })] : ['warn', t('egibMissing')]],
      ['addressEvidence', roof.addressMethod === 'inside' ? ['ok', t('addressInside')] : roof.addressMethod === 'nearest' ? ['partial', t('addressNearest', { value: fmt(roof.addressDistanceM) })] : ['open', t('notChecked')]],
      ['parcelEvidence', parts ? ['partial', t('parcelFromId', { parcel: esc(parts.parcel) })] : ['open', t('notChecked')]],
      ['ownershipEvidence', !hasRegisters ? ['open', t('notChecked')] : roof.ownership ? [CITY_GROUPS.includes(owner) ? 'partial' : 'warn', t('owner_' + owner)] : ['open', t('owner_unknown')]],
      ['protectionEvidence', !hasRegisters && !hasContext ? ['open', t('notChecked')] : flags.length ? [flags.some(f => f.level === 'permit') ? 'warn' : 'partial', flags.map(protectionText).join('; ')] : ['partial', t('protectionNone')]],
      ['pvEvidence', !hasRegisters ? ['open', t('notChecked')] : roof.res?.length ? ['warn', t('resFound', { types: esc(roof.res.join(', ')) })] : ['partial', t('resNone')]],
    ];
    const counted = status => rows.filter(([, [value]]) => value === status).length;
    return `<section class="roof-evidence" aria-label="${t('evidenceTitle')}"><h4>${t('evidenceTitle')}</h4><p>${t('checkedCount', { checked: counted('ok') + counted('warn'), partial: counted('partial'), open: counted('open'), count: rows.length })}</p><dl>${rows.map(([label, [status, text]]) => `<div class="check-${status}"><dt><span class="check-icon" aria-hidden="true">${STATUS_ICON[status]}</span>${t(label)}</dt><dd>${text}</dd></div>`).join('')}</dl><p>${t('parcelLimit')}</p><a href="${OWNERSHIP_SOURCE.directoryUrl}" target="_blank" rel="noopener">${t('ownershipSourceLink')} ↗</a></section>`;
  }

  function detailPanel() {
    const { roofById, reasons } = getCalculation();
    const roof = roofById.get(state.roofId);
    if (!roof) return '';
    const chosen = state.result?.selectedIds.includes(roof.id), excluded = state.excludedIds.includes(roof.id);
    const share = chosen && state.result.totals.annualEnergyKwh ? roof.annualEnergyKwh / state.result.totals.annualEnergyKwh * 100 : 0;
    const reasonKeys = { 'Wykluczenie użytkownika': 'excludedUser', 'Brak flagi zielonego dachu': 'excludedGreen', 'Filtr odnotowanych inwestycji': 'excludedInvestment', 'Moc poniżej progu scenariusza': 'excludedCapacity', 'Niski uzysk jednostkowy': 'excludedYield', 'Poza działkami miasta': 'excludedCity', 'Brak w aktualnej EGiB': 'excludedEgib', 'Ochrona konserwatorska': 'excludedHeritage' };
    const reason = chosen ? t('selectedReason', { value: fmt(share, 1) }) : t(reasonKeys[reasons[roof.id]] || (roof.costPln > state.parameters.budgetPln ? 'tooExpensive' : 'notSelected'));
    const location = getMapLocation(roof.id);
    const flags = heritageFlags(roof), permit = flags.filter(f => f.level === 'permit'), opinion = flags.filter(f => f.level === 'opinion');
    const reference = horizontalPvgis();
    const parcel = roofParts(roof.id)?.parcel;
    const capacity = `${fmt(roof.capacityKwp, 1)} ${t('kwp')}${roof.capped ? `<small class="fact-sub">${t('cappedFrom', { value: fmt(roof.potentialKwp) })}</small>` : ''}`;
    return `<div class="detail" id="roof-details"><div class="detail-heading"><span>${t('detail')}</span><span class="tag ${chosen ? '' : 'gray'}">${t(chosen ? 'inPlan' : 'outsidePlan')}</span></div><h3>${title(roof)}</h3><p class="detail-place">${subtitle(roof)}${roof.addressMethod === 'nearest' ? ` · ${t('addressApprox')}` : ''}</p><p class="detail-id">${esc(roof.id)}</p><button class="button map-focus-button" data-action="focus-roof" data-id="${esc(roof.id)}">${icon('pin')}${t('showOnMap')}</button>${[
      ...('inEgib' in roof ? [[t('buildingClassLabel'), roof.buildingClass ? esc(roof.buildingClass.name) : '—', true]] : []),
      ...(roof.ownership ? [[t('parcelLabel'), `${esc(parcel || '')}<small class="fact-sub">${esc(roof.ownership.description)}</small>`, true]] : []),
      [t('usableArea'), `${fmt(roof.usableAreaM2)} ${t('area')}`],
      [t('averageIrradiation'), `${fmt(roof.averageIrradiationKwhM2)} ${t('irradiationUnit')}`],
      ...(reference ? [[t('sunIndex'), t('sunIndexValue', { value: fmt(100 * roof.averageIrradiationKwhM2 / reference.irradiationKwhPerM2) })]] : []),
      [t('capacity'), capacity],
      [t('roofEnergy'), `${fmt(roof.annualEnergyKwh / 1000, 1)} ${t('mwhYear')}`],
      [t('specificYield'), `${fmt(roof.specificYieldKwhPerKwp)} ${t('yieldUnit')}`],
      [t('roofCost'), `${fmt(roof.costPln)} zł`],
      [t('roofCo2'), `${fmt(roof.co2Tonnes, 1)} ${t('co2Unit')}`],
    ].map(([label, value, wide]) => `<div class="fact${wide ? ' fact-wide' : ''}"><span>${label}</span><strong>${value}</strong></div>`).join('')}<div class="procedure procedure-${roof.procedure}"><b>${t('procedure_' + roof.procedure)}</b><span>${t('procedureHelp_' + roof.procedure)}</span></div>${permit.length ? warning(t('heritageWarning', { items: [...permit, ...opinion].map(protectionText).join('; ') })) : opinion.length ? warning(t('heritageOpinion', { items: opinion.map(protectionText).join('; ') }), true) : ''}${ownerKey(roof) === 'municipalLease' ? warning(t('ownerLeaseNote'), true) : ''}<div class="detail-reason">${reason}</div>${checklist(roof)}<p class="detail-warnings">${roof.greenRoofPotential ? t('greenFlag') : ''}${roof.investmentLabel ? t('investmentFlag', { label: esc(roof.investmentLabel) }) : ''}</p>${location ? `<a class="location-link" href="${location.url}" target="_blank" rel="noopener">${t('openOsm')}</a>` : ''}<button class="button ${excluded ? '' : 'danger'}" data-action="exclude" data-id="${esc(roof.id)}">${t(excluded ? 'restore' : 'exclude')}${icon('arrow')}</button></div>`;
  }

  function portfolioPanel() {
    const { roofById } = getCalculation(), r = state.result;
    const chosen = r?.selectedIds.map(id => roofById.get(id)) || [];
    const facts = planFacts();
    const largest = facts?.largestId ? roofById.get(facts.largestId) : null;
    const summary = facts?.count ? `<div class="plan-summary"><div class="procedure-chips">${PROCEDURES.filter(x => facts.procedures[x.key]).map(x => `<span class="chip procedure-${x.key}" title="${t('procedureHelp_' + x.key)}">${t('procedureShort_' + x.key)}: <b>${facts.procedures[x.key]}</b></span>`).join('')}</div>${facts.cappedCount ? `<p>${t('cappedSummary', { count: facts.cappedCount, value: capLabel(state.parameters.maxCapacityKwp) })}</p>` : ''}${facts.heritageCount ? `<p class="warn-text">${t('heritageSummary', { count: facts.heritageCount })}</p>` : ''}${facts.largestSharePercent > 30 && facts.count > 1 ? `<div class="warning-box">${icon('warn')}<span>${t('concentrationWarning', { value: fmt(facts.largestSharePercent), title: largest ? title(largest) : '' })}</span></div>` : ''}</div>` : '';
    return `<aside class="panel portfolio"><div class="portfolio-head"><div class="eyebrow">${t('portfolioTitle')}</div><h2>${t('portfolioCount', { count: chosen.length })}</h2><p>${t('portfolioHelp')}</p></div>${summary}<div class="portfolio-list">${chosen.length ? chosen.map((roof, i) => roofRow(roof, i, true)).join('') : `<div class="empty"><strong>${t(state.busy ? 'waiting' : 'emptyPlan')}</strong>${t(state.busy ? 'waitingHelp' : 'emptyPlanHelp')}</div>`}</div>${detailPanel()}<div class="portfolio-footer"><span>${t('remaining')}</span><strong>${fmt(r?.remainingPln || 0)} zł</strong></div></aside>`;
  }

  function printTop() {
    const p = state.parameters, facts = planFacts();
    if (!facts) return '';
    const tiles = [[t('energy'), fmt(facts.annualEnergyKwh / 1000), t('mwhYear')], [t('cost'), million(facts.costPln), 'zł'], [t('co2'), fmt(facts.co2Tonnes), t('co2Unit')], [t('costPerMwhHeading'), facts.costPerMwhPln ? fmt(facts.costPerMwhPln) : '—', 'zł']];
    return `<section class="print-only report-top"><div class="report-head"><b>Dachy Miasta</b><span>${t('reportTitle')} · ${new Date().toLocaleDateString(LOCALES[state.language])}</span></div><h2>${t('reportHeadline', { count: facts.count, budget: million(p.budgetPln) })}</h2><div class="report-kpis">${tiles.map(([label, value, unit]) => `<div><span>${label}</span><b>${value} <small>${unit}</small></b></div>`).join('')}</div></section>`;
  }

  function printReport() {
    const { roofById } = getCalculation(), p = state.parameters, r = state.result, facts = planFacts();
    if (!r) return '';
    const yesNo = value => t(value ? 'yes' : 'no');
    return `<section class="print-only report-bottom"><table><thead><tr><th>#</th><th>${t('buildingHeading')}</th><th>${t('kwp')}</th><th>${t('mwhYear')}</th><th>zł</th><th>${t('procedureHeading')}</th><th>${t('ownerHeading')}</th><th>${t('protectionHeading')}</th></tr></thead><tbody>${r.selectedIds.map((id, i) => { const roof = roofById.get(id); return `<tr><td>${i + 1}</td><td><b>${title(roof)}</b><br><small>${subtitle(roof)}${roof.buildingClass ? ' · ' + esc(roof.buildingClass.name) : ''}</small></td><td>${fmt(roof.capacityKwp, 1)}</td><td>${fmt(roof.annualEnergyKwh / 1000, 1)}</td><td>${fmt(roof.costPln)}</td><td>${t('procedureShort_' + roof.procedure)}</td><td>${t('ownerShort_' + ownerKey(roof))}</td><td>${heritageFlags(roof).map(f => t('protectionShort_' + f.key)).join(', ') || '—'}</td></tr>`; }).join('')}</tbody></table><p>${t('reportTotals', { budget: fmt(p.budgetPln), cost: fmt(r.totals.costPln), remaining: fmt(r.remainingPln), energy: fmt(r.totals.annualEnergyKwh / 1000, 1), unit: t('mwh') })} ${t('reportImpact', { co2: fmt(facts.co2Tonnes), costPerMwh: facts.costPerMwhPln ? fmt(facts.costPerMwhPln) : '—' })} ${registers ? t('reportCityLand', { city: facts.cityLandCount, count: facts.count, heritage: facts.heritageCount }) : ''}</p><p>${t('reportParams', { coverage: fmt(p.coverage * 100), efficiency: fmt(p.efficiency * 100), pr: fmt(p.performanceRatio * 100), unitCost: fmt(p.costPerKwpPln), fixed: fmt(p.fixedCostPln), minimum: fmt(p.minCapacityKwp) })} ${t('reportCap', { value: capLabel(p.maxCapacityKwp), factor: fmt(p.co2KgPerMwh) })} ${t('reportDataFilters', { city: yesNo(p.onlyCityLand), egib: yesNo(p.requireCurrentBuilding), heritage: yesNo(p.omitHeritage) })} ${t('reportFilters', { green: yesNo(p.onlyGreen), investments: yesNo(p.omitInvestmentLabels), ids: esc(state.excludedIds.join(', ') || t('none')) })}</p><p><b>${t('reportNextSteps')}</b></p><p class="report-source">${t('reportSource', { file: esc(metadata.referenceFile) })} MSIP: MONIT-AIR, ${[context && 'Adresy, Parki kulturowe', registers && 'EGiB, Struktura własności, Zabytki, UNESCO, OZE'].filter(Boolean).join(', ')}${pvgis ? ', PVGIS 5.2 (JRC)' : ''}. KOBiZE 12.2024.</p></section>`;
  }

  function planView() {
    const { candidates } = getCalculation(), r = state.result, facts = planFacts();
    const costNote = facts?.costPerMwhPln ? t('costPerMwhNote', { value: fmt(facts.costPerMwhPln), budget: million(state.parameters.budgetPln) }) : t('budgetNote', { value: million(state.parameters.budgetPln) });
    const countNote = facts ? t('countNote', { city: registers ? facts.cityLandCount : '—', address: facts.addressCount, candidates: fmt(candidates.length) }) : t('candidates', { count: fmt(candidates.length) });
    return `${heading(t('hero'), t('heroDescription'))}<ol class="workflow">${['step1', 'step2', 'step3'].map((key, i) => `<li><span>${i + 1}</span>${t(key)}</li>`).join('')}</ol><div class="kpis" aria-live="polite">${kpi(t('energy'), r ? fmt(r.totals.annualEnergyKwh / 1000) : '—', t('mwhYear'), t('energyNote'), 'sun', true)}${kpi(t('cost'), r ? million(r.totals.costPln) : '—', 'zł', costNote, 'wallet')}${kpi(t('count'), r ? fmt(r.totals.count) : '—', '', countNote, 'roof')}${kpi(t('co2'), facts ? fmt(facts.co2Tonnes) : '—', t('co2Unit'), t('co2Note', { value: fmt(state.parameters.co2KgPerMwh) }), 'leaf')}</div>${printTop()}<div class="planner">${parametersPanel()}<div class="center-stack">${mapPanel()}${analysisPanel()}${scenariosPanel()}</div>${portfolioPanel()}</div>${printReport()}`;
  }

  function dataView() {
    const { evaluated, reasons } = getCalculation();
    const selected = new Set(state.result?.selectedIds || []);
    const status = r => selected.has(r.id) ? 'plan' : reasons[r.id] ? 'outside' : 'candidate';
    const query = state.search.trim().toLowerCase();
    const filters = { all: () => true, plan: r => status(r) === 'plan', candidate: r => status(r) === 'candidate', outside: r => status(r) === 'outside', city: r => isCityLand(r) === true, heritage: needsConservator, noAddress: r => !r.address, missingEgib: r => r.inEgib === false };
    const keyOf = { name: r => (r.address || r.id).toLowerCase(), district: r => r.district || '', capacity: r => r.capacityKwp, energy: r => r.annualEnergyKwh, yield: r => r.specificYieldKwhPerKwp, procedure: r => PROCEDURES.findIndex(p => p.key === r.procedure), owner: r => t('ownerShort_' + ownerKey(r)), status: r => ['plan', 'candidate', 'outside'].indexOf(status(r)) };
    const sort = state.sort || { key: 'energy', dir: 'desc' };
    const visible = evaluated
      .filter(filters[state.dataFilter] || filters.all)
      .filter(r => !query || [r.id, r.address, r.district, r.investmentLabel, r.culturalPark, r.buildingClass?.name, r.urbanLayout].some(v => v?.toLowerCase().includes(query)))
      .sort((a, b) => { const x = keyOf[sort.key](a), y = keyOf[sort.key](b); return (typeof x === 'string' ? x.localeCompare(y, 'pl') : x - y) * (sort.dir === 'asc' ? 1 : -1) || a.id.localeCompare(b.id); });
    const pageSize = 25, pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
    state.page = Math.min(state.page, pageCount - 1);
    const sortHeader = (key, label) => `<th aria-sort="${sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button class="sort-button" data-action="sort" data-key="${key}">${label}${sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
    const statusCell = r => status(r) === 'plan' ? `<span class="tag amber">${t('inPlan')}</span>` : t(status(r) === 'outside' ? (state.excludedIds.includes(r.id) ? 'excluded' : 'outsideCriteria') : 'candidate');
    const stats = context?.stats;
    return `${heading(t('dataTitle'), t('dataDescription'), t('dataEyebrow'))}<div class="notice">${t('dataNotice', { count: roofs.length })} ${verification ? t('geometryNotice', { count: verification.matchingReferenceIds }) : t('noGeometry')} ${stats ? t('contextNotice', { address: stats.inside + stats.nearest, inside: stats.inside, nearest: stats.nearest, count: stats.roofs, parks: stats.culturalPark }) : ''}</div>${reviewPanel()}<section class="panel"><div class="table-toolbar"><input id="roof-search" class="search-field" type="search" placeholder="${t('search')}" aria-label="${t('searchLabel')}" value="${esc(state.search)}"><label class="filter-label">${t('filterLabel')}<select id="data-filter" class="small-input">${Object.keys(filters).map(f => `<option value="${f}" ${state.dataFilter === f ? 'selected' : ''}>${t('filter_' + f)}</option>`).join('')}</select></label><span>${t('dataCounts', { count: visible.length, green: metadata.greenRoofPotential, investments: metadata.investmentLabels })}</span></div><div class="table-wrap"><table><thead><tr>${sortHeader('name', t('buildingHeading'))}${sortHeader('district', t('districtHeading'))}${sortHeader('capacity', t('powerHeading', { unit: t('kwp') }))}${sortHeader('energy', t('energyHeading', { unit: t('mwhYear') }))}${sortHeader('yield', t('yieldHeading'))}${sortHeader('procedure', t('procedureHeading'))}${sortHeader('owner', t('ownerHeading'))}<th>${t('protectionHeading')}</th>${sortHeader('status', t('status'))}</tr></thead><tbody>${visible.slice(state.page * pageSize, (state.page + 1) * pageSize).map(r => `<tr><td><button data-roof-id="${esc(r.id)}" data-open-plan>${title(r)}</button><div class="hash">${r.address ? name(r.id) + ' · ' : ''}${esc(r.id)}${r.investmentLabel ? ' · ' + esc(r.investmentLabel) : ''}</div>${r.buildingClass ? `<div class="row-meta">${esc(r.buildingClass.name)}</div>` : ''}</td><td>${esc(r.district || '—')}</td><td>${fmt(r.capacityKwp, 1)}${r.capped ? ' *' : ''}</td><td>${fmt(r.annualEnergyKwh / 1000, 1)}</td><td>${fmt(r.specificYieldKwhPerKwp)}</td><td><span class="chip procedure-${r.procedure}">${t('procedureShort_' + r.procedure)}</span></td><td><span class="owner owner-${ownerKey(r)}" title="${esc(r.ownership?.description || '')}">${t('ownerShort_' + ownerKey(r))}</span></td><td>${protectionTags(r) || t('noFlag')}</td><td>${statusCell(r)}</td></tr>`).join('') || `<tr><td colspan="9">${t('noResults')}</td></tr>`}</tbody></table></div><p class="table-note">${t('cappedTableNote', { value: capLabel(state.parameters.maxCapacityKwp) })}</p><div class="pagination"><button class="button compact" data-action="prev-page" ${state.page === 0 ? 'disabled' : ''}>${t('previous')}</button><span>${t('page', { page: state.page + 1, count: pageCount })}</span><button class="button compact" data-action="next-page" ${state.page >= pageCount - 1 ? 'disabled' : ''}>${t('next')}</button></div></section>`;
  }

  function reviewPanel() {
    return `<section class="panel review-panel"><div><h2>${t('reviewTitle')}</h2><p>${t('reviewHelp')}</p><p class="review-status">${t('reviewPending')}</p></div><button class="button" data-action="export-review" ${state.busy ? 'disabled' : ''}>${icon('download')}${t('reviewDownload')}</button></section>`;
  }

  function methodView() {
    const stats = context?.stats;
    const contextSources = context?.sources || [];
    const procedureTable = `<table class="mini-table"><thead><tr><th>${t('procedureHeading')}</th><th>${t('procedureRequirements')}</th></tr></thead><tbody>${PROCEDURES.map(p => `<tr><td><span class="chip procedure-${p.key}">${t('procedureShort_' + p.key)}</span></td><td>${t('procedureHelp_' + p.key)}</td></tr>`).join('')}</tbody></table>`;
    return `${heading(t('methodTitle'), t('methodDescription'), t('methodEyebrow'))}<div class="document-grid"><section class="panel document-section"><h2>${t('modelTitle')}</h2><p>${t('modelIntro')}</p><div class="formula">${t('formula').replaceAll('\n', '<br>')}</div><p>${t('modelLimits')}</p><p>${t('yieldExplanation')}</p>${horizontalPvgis() ? `<p>${t('pvgisCalibration', { irradiation: fmt(horizontalPvgis().irradiationKwhPerM2), horizontal: fmt(horizontalPvgis().energyKwhPerKwp), model: fmt(horizontalPvgis().irradiationKwhPerM2 * state.parameters.performanceRatio), tilted: fmt(pvgis.cases.find(c => c.key === 'flat10')?.energyKwhPerKwp ?? 0) })}</p>` : ''}<h2>${t('capTitle')}</h2><p>${t('capExplanation')}</p>${procedureTable}<p class="field-help">${t('procedureCaveat')}</p><h2>${t('selectionTitle')}</h2><p>${t('selectionIntro')}</p><ol>${['strategyLargest', 'strategyRatio', 'strategyDp'].map(key => `<li>${t(key)}</li>`).join('')}</ol><p>${t('selectionLimits')}</p><h3>${t('boundTitle')}</h3><p>${t('boundExplanation')}</p><h2>${t('sensitivityTitle')}</h2><p>${t('sensitivityExplanation')}</p><p>${t('curveExplanation')}</p><h2>${t('impactTitle')}</h2><p>${t('co2Explanation', { value: fmt(state.parameters.co2KgPerMwh) })}</p><button class="button" data-action="export-json" ${state.busy ? 'disabled' : ''}>${icon('download')}${t('exportJson')}</button></section><div><section class="panel document-section"><h2>${t('provenance')}</h2><div class="quality-grid">${[[roofs.length, 'uniqueIds'], [verification?.matchingReferenceIds ?? '—', 'geometryMatches'], [stats ? stats.inside + stats.nearest : '—', 'addressMatches'], [stats?.culturalPark ?? '—', 'parkMatches'], [registers?.stats.cityOwned ?? '—', 'cityLandMatches'], [registers ? registers.stats.monumentRegister + registers.stats.monumentInventory : '—', 'monumentMatches']].map(([value, key]) => `<div class="quality-tile"><b>${value}</b><span>${t(key)}</span></div>`).join('')}</div>${metadata.sources.map((s, i) => `<div class="source-entry"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a><p>${t('sourceRole' + i)}</p></div>`).join('')}${contextSources.map((s, i) => `<div class="source-entry"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a><p>${t(i === 0 ? 'sourceRoleAddress' : 'sourceRolePark')} ${s.currency ? esc(s.currency.replace('_', ' ')) + '.' : ''}</p></div>`).join('')}${registers ? `<div class="source-entry"><b>${t('registersSources')}</b><p class="source-links">${registers.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name.replace(/^MSIP · /, ''))}</a>`).join(' · ')}</p></div>` : ''}${pvgis ? `<div class="source-entry"><a href="${esc(pvgis.source.url)}" target="_blank" rel="noopener">${esc(pvgis.source.name)} ↗</a><p>${t('sourceRolePvgis')}</p></div>` : ''}<h3>${t('contextMethodTitle')}</h3><p>${stats ? t('contextMethod', { inside: stats.inside, nearest: stats.nearest, none: stats.withoutAddress, parks: stats.culturalPark, date: esc(context.retrievedAt.slice(0, 10)) }) : t('contextMissing')}</p><h3>${t('registersTitle')}</h3><p>${registers ? t('registersMethod', { date: esc(registers.retrievedAt.slice(0, 10)), egib: registers.stats.inEgib, egibDate: esc(registers.currency.egib || '—'), owned: registers.stats.ownership, city: registers.stats.cityOwned, ownershipDate: esc(registers.currency.ownership || '—'), register: registers.stats.monumentRegister, inventory: registers.stats.monumentInventory, urban: registers.stats.urbanLayout, unesco: registers.stats.unesco, res: registers.stats.res }) : t('registersMissing')}</p><h3>${t('verificationTitle')}</h3><p>${verification ? t('verificationText', { official: fmt(verification.officialRecordCount), matched: verification.matchingReferenceIds, count: roofs.length, differences: verification.attributeDifferences.length, date: esc(verification.retrievedAt) }) : t('noGeometry')}</p><p>${t('sourceLimits')}</p><h3>${t('sourceHash')}</h3><p class="hash">SHA256 ${metadata.referenceSha256}</p></section><section class="panel document-section" style="margin-top:18px"><h2>${t('testedTitle')}</h2><p>${t('testedText')}</p>${benchmark ? `<p>${t('benchmarkText', { records: benchmark.referenceRecords, cases: benchmark.cases.length })}</p><a class="button compact" href="./data/benchmark.json" target="_blank" rel="noopener">${t('openBenchmark')}</a>` : ''}<p>${t('greenLimits')}</p></section></div></div>`;
  }

  return {
    t,
    html() {
      const active = state.view;
      const views = [['plan', 'grid'], ['data', 'layers'], ['method', 'book']];
      const sizes = [1, 2, 3].map(size => `<button class="size-${size}${state.fontSize === size ? ' active' : ''}" data-action="font-size" data-size="${size}" aria-pressed="${state.fontSize === size}" title="${t('fontSize' + size)}"><span aria-hidden="true">A</span><span class="sr-only">${t('fontSize' + size)}</span></button>`).join('');
      const themes = [['basic', 'themeBasic'], ['contrast', 'themeContrast']].map(([theme, key]) => `<button class="theme-${theme}${state.theme === theme ? ' active' : ''}" data-action="theme" data-theme="${theme}" aria-pressed="${state.theme === theme}" title="${t(key)}"><span aria-hidden="true">A</span><span class="sr-only">${t(key)}</span></button>`).join('');
      const languages = ['pl', 'ru'].map(language => `<button data-language="${language}" class="${state.language === language ? 'active' : ''}" aria-pressed="${state.language === language}" lang="${language}">${language.toUpperCase()}</button>`).join('<span aria-hidden="true">|</span>');
      return `<div class="shell ${state.busy ? 'calculating' : ''}"><div class="utility-bar"><div class="container utility-inner"><div class="a11y" role="group" aria-label="${t('a11yLabel')}"><span class="a11y-sizes">${sizes}</span><span class="a11y-themes">${themes}</span></div><div class="language-links" role="group" aria-label="${t('language')}">${languages}</div></div></div><header class="site-header"><div class="container header-inner"><button class="brand" data-view="plan"><span class="brand-mark" aria-hidden="true">${icon('roof')}</span><span class="brand-text"><strong>Dachy Miasta</strong><small>${t('tagline')}</small></span></button><div class="header-actions"><span class="city-label">${icon('pin')}${t('city')}</span><button class="button" data-action="print" ${state.busy ? 'disabled' : ''}>${icon('print')}<span class="button-label">${t('pdf')}</span><span class="button-short">PDF</span></button><button class="button primary" data-action="export-csv" ${state.busy || !state.result ? 'disabled' : ''}>${icon('download')}<span class="button-label">${t('csv')}</span><span class="button-short">CSV</span></button></div></div></header><nav class="main-nav" aria-label="${t('navigation')}"><div class="container nav-inner">${views.map(([id, symbol]) => `<button data-view="${id}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${t(id)}</span></button>`).join('')}</div></nav><main id="main" class="container"><nav class="breadcrumb" aria-label="${t('breadcrumbLabel')}"><button data-view="plan">Dachy Miasta</button><span aria-hidden="true">›</span><span aria-current="page">${t(active)}</span></nav>${active === 'data' ? dataView() : active === 'method' ? methodView() : planView()}</main><footer class="site-footer"><div class="container footer-inner"><div class="footer-brand"><strong>Dachy Miasta</strong><span>${t('footer')}</span><span>${t('notOfficial')}</span></div><div class="footer-links"><span>${t('footerLimits')}</span><button data-view="method">${t('sourcesLink')} →</button></div></div></footer></div>`;
    },
  };
}
