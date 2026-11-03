import { DAY_SECONDS, simulationClock, simulationSnapshot, suggestedRowGap, currentOptimum } from './core/simulation.js';
import { renderRoofScene } from './roof-scene.js';
import { solarRecordUrl } from './core/provenance.js';

const directions = [[0, 'simNorth'], [45, 'simNortheast'], [90, 'simEast'], [135, 'simSoutheast'], [180, 'simSouth'], [225, 'simSouthwest'], [270, 'simWest'], [315, 'simNorthwest']];
// 3 × 3 compass, north up; the centre cell is the roof itself.
const compass = [[315, 'NW'], [0, 'N'], [45, 'NE'], [270, 'W'], null, [90, 'E'], [225, 'SW'], [180, 'S'], [135, 'SE']];
const shortDirection = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const scenarios = [['cloudy', 'simCloudyShort', 'P10'], ['typical', 'simTypicalShort', 'P50'], ['sunny', 'simSunnyShort', 'P90']];
const scenarioKeys = { typical: 'simTypicalShort', sunny: 'simSunnyShort', cloudy: 'simCloudyShort' };

export function createSimulationView({ t, fmt, esc, getSimulation, getSelectedRoof, getSimulationData = () => ({}), getLanguage = () => 'ru', help = () => '', icon = () => '', getPlanRoofs = () => [], roofTitle = roof => esc(roof.address || roof.id) }) {
  const monthName = month => new Intl.DateTimeFormat(getLanguage() === 'pl' ? 'pl-PL' : 'ru-RU', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2025, month - 1, 15));
  const monthShort = month => monthName(month).slice(0, 3);
  const dir = az => t(directions.find(([angle]) => angle === az)?.[1] || 'simSouth');
  const pressed = on => `aria-pressed="${on}"${on ? ' class="selected"' : ''}`;
  // Sliders carry their unit and precision so the controller can update the readout while the thumb moves.
  const range = (sim, key, label, min, max, step, unit) => {
    const digits = step < 1 ? 1 : 0;
    return `<div class="sim-field"><div class="sim-label"><label for="sim-${key}">${label}</label><output for="sim-${key}" data-digits="${digits}" data-unit="${unit}">${fmt(sim[key], digits)}${unit}</output></div><input type="range" id="sim-${key}" data-sim-param="${key}" min="${min}" max="${max}" step="${step}" value="${sim[key]}"></div>`;
  };

  function playButton(sim) {
    return `${icon(sim.running ? 'pause' : 'play')}<span>${t(sim.running ? 'simPause' : 'simPlay')}</span>`;
  }

  const dayCaption = sim => `<span>${t('simDayChart', { date: esc(sim.day.date) })} ${help('simPower')}</span><b>${t('simDayTotalShort', { energy: fmt(sim.dayEnergyKwh) })}</b>`;

  /** Single series, so no legend: the caption names it. Past hours solid, the rest light; red rule = selected time. */
  function dayChart(sim) {
    const W = 640, H = 150, L = 36, R = 6, T = 12, B = 22, cell = (W - L - R) / 24, base = H - B;
    const peak = Math.max(...sim.profile.map(r => r.powerW)) / 1000;
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => peak / s <= 4) || 1000;
    const top = Math.max(step, Math.ceil(peak / step) * step), y = kw => T + (base - T) * (1 - kw / top);
    const hour = sim.timeSeconds / 3600, x = h => L + h * cell;
    const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map(v => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('');
    const bars = sim.profile.map(r => {
      const kw = r.powerW / 1000, h = Math.max(0, base - y(kw));
      return `<rect class="${r.hour <= hour ? 'past' : 'future'}" x="${(x(r.hour) + 1).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${(cell - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${String(r.hour).padStart(2, '0')}:00–${String(r.hour + 1).padStart(2, '0')}:00 · ${fmt(kw, 1)} ${t('simKw')}</title></rect>`;
    }).join('');
    const ticks = [0, 6, 12, 18, 24].map(h => `<text class="axis-label" x="${x(h)}" y="${H - 6}" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}">${String(h).padStart(2, '0')}:00</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('simChart')}">${grid}${bars}<line class="baseline" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>${ticks}<line class="now-line" x1="${x(hour)}" x2="${x(hour)}" y1="${T - 4}" y2="${base}"/></svg>`;
  }

  /** Redrawn on every playback tick and camera drag; holds nothing clickable, so a click is never lost mid-redraw. */
  function frame() {
    const sim = getSimulation();
    if (!sim) return '';
    const now = simulationSnapshot(sim), night = now.sun.elevation <= 0;
    const hud = `<div class="sim-hud"><strong class="simulation-clock">${simulationClock(sim.timeSeconds)}</strong><span class="sim-hud-power">${night ? t('simNight') : t('simHudNow', { power: fmt(now.powerW / 1000, 1) })}</span><span>${t('simHudSoFar', { energy: fmt(now.energyWh / 1000) })}</span><small>${t('simWeatherAtHour', { air: fmt(now.temperature, 1), module: fmt(now.moduleTemperature, 1), wind: fmt(now.wind, 1), elevation: fmt(now.sun.elevation, 1) })}</small></div>`;
    return `<div class="sim-scene">${renderRoofScene(sim, { t, fmt, esc })}${hud}</div>`;
  }

  /** The search fills in steps 1's tilt, direction and row gap; it never changes the sketch until applied. */
  function optimizer(sim) {
    const best = currentOptimum(sim);
    const applied = best && best.tilt === sim.tilt && best.azimuth === sim.azimuth && Math.abs(best.rowGapM - sim.rowGapM) < 0.05;
    const gain = best ? (best.annualEnergyKwh - sim.forecast.annualEnergyKwh) / 1000 : 0;
    const result = best ? `<div class="sim-optimum${applied ? ' is-current' : ''}"><span>${t('simOptimumLabel')} <b>${best.tilt}° · ${dir(best.azimuth)} · ${t('simGapShort', { gap: fmt(best.rowGapM, 1) })}</b></span><span class="sim-optimum-value"><b>${fmt(best.annualEnergyKwh / 1000, 1)} ${t('simMwhYear')}</b>${applied ? `<em>${t('simOptimumApplied')}</em>` : `${gain >= 0.05 ? `<em>${t('simOptimumGain', { gain: fmt(gain, 1) })}</em>` : ''}<button type="button" class="button compact" id="sim-apply-optimum" data-action="simulation-apply-optimum">${t('simApply')}</button>`}</span></div>` : '';
    return `<div class="sim-optimize-head"><button type="button" class="button primary" id="sim-optimize" data-action="simulation-optimize" ${sim.search ? 'disabled' : ''}>${icon('sun')}<span>${sim.search ? t('simOptimizing', { percent: fmt(sim.search.progress * 100) }) : t('simOptimize')}</span></button>${help('simBest')}</div>${result}`;
  }

  function controls(sim) {
    const gap = suggestedRowGap(sim);
    return `<div class="sim-optimize" id="sim-optimize-box">${optimizer(sim)}</div><section class="sim-group"><h2><span class="sim-step">1</span>${t('simGroupInstall')}${help('simAngles')}</h2>
      ${range(sim, 'tilt', t('simTiltShort'), 0, 60, 5, '°')}
      <div class="sim-field"><div class="sim-label"><span id="sim-azimuth-label">${t('simAzimuthShort')}</span><output>${dir(sim.azimuth)} · ${sim.azimuth}°</output></div><div class="compass" id="sim-azimuth" role="group" aria-labelledby="sim-azimuth-label">${compass.map(cell => cell ? `<button type="button" id="sim-az-${cell[0]}" data-action="simulation-direction" data-azimuth="${cell[0]}" ${pressed(sim.azimuth === cell[0])} aria-label="${dir(cell[0])} · ${cell[0]}°">${t('simDir' + cell[1])}</button>` : `<span class="compass-core" aria-hidden="true">${icon('roof')}</span>`).join('')}</div></div>
      <details class="sim-more" data-disclosure="sim-layout"><summary>${t('simRowsTitle')}<small>${t('simRowsSummary', { gap: fmt(sim.rowGapM, 1), setback: fmt(sim.setbackM, 1) })}</small></summary>
        ${range(sim, 'rowGapM', t('simRowGap'), 0.3, 6, 0.1, ' m')}<p class="field-help">${t('simNoShadeGap', { gap: fmt(gap, 1) })} ${help('simRows')}</p>
        ${range(sim, 'setbackM', t('simSetback'), 0.3, 3, 0.1, ' m')}<p class="field-help">${t('simPanelSize')}</p></details></section>
    <section class="sim-group"><h2><span class="sim-step">2</span>${t('simGroupDay')}${help('simWeather')}</h2>
      <div class="sim-label"><span id="sim-month-label">${t('simMonth')}</span><output>${monthName(sim.month)}</output></div><div class="month-chips" id="sim-month" role="group" aria-labelledby="sim-month-label">${Array.from({ length: 12 }, (_, i) => i + 1).map(m => `<button type="button" id="sim-month-${m}" data-action="simulation-season" data-month="${m}" ${pressed(sim.month === m)} aria-label="${monthName(m)}">${monthShort(m)}</button>`).join('')}</div>
      <div class="sim-label"><span id="sim-scenario-label">${t('simDayKind')}</span></div><div class="segmented" id="sim-scenario" role="group" aria-labelledby="sim-scenario-label">${scenarios.map(([key, label, percentile]) => `<button type="button" id="sim-weather-${key}" data-action="simulation-weather" data-scenario="${key}" ${pressed(sim.scenario === key)}>${t(label)}<small>${percentile}</small></button>`).join('')}</div></section>
    <section class="sim-group"><h2><span class="sim-step">3</span>${t('simGroupLosses')}${help('simWeather')}</h2>
      ${range(sim, 'shadePercent', t('simShade'), 0, 100, 5, '%')}${range(sim, 'snowPercent', t('simSnow'), 0, 100, 5, '%')}</section>`;
  }

  function stage(sim) {
    return `<section class="panel sim-stage" aria-label="${t('simSceneLabel')}"><div id="simulation-frame" class="sim-frame" title="${t('simDrag')}">${frame()}</div><figure class="sim-day-chart"><figcaption id="sim-day-caption">${dayCaption(sim)}</figcaption><div id="simulation-day">${dayChart(sim)}</div></figure>
      <div class="sim-camera"><button type="button" class="icon-button" data-action="simulation-rotate" data-step="-45" title="${t('simRotateLeft')}" aria-label="${t('simRotateLeft')}">${icon('rotateLeft')}</button><button type="button" class="icon-button" data-action="simulation-rotate" data-step="45" title="${t('simRotateRight')}" aria-label="${t('simRotateRight')}">${icon('rotateRight')}</button><details class="sim-camera-menu" data-disclosure="sim-camera"><summary class="icon-button" title="${t('simCameraShort')}" aria-label="${t('simCameraShort')}">${icon('eye')}</summary><div class="sim-popover">${range(sim, 'viewYaw', t('simViewYaw'), -180, 180, 5, '°')}${range(sim, 'viewPitch', t('simViewPitch'), 15, 80, 5, '°')}<button type="button" class="button compact" data-action="simulation-view-reset">${t('simViewReset')}</button><p class="field-help">${t('simDrag')}. ${t('simCameraHelp')}</p></div></details></div>
      <div class="simulation-playback sim-playback"><button type="button" class="button primary sim-play" data-action="simulation-toggle" aria-pressed="${sim.running}">${playButton(sim)}</button><button type="button" class="icon-button" data-action="simulation-reset" title="${t('simReset')}" aria-label="${t('simReset')}">${icon('rewind')}</button><input type="range" id="sim-timeSeconds" data-sim-param="timeSeconds" min="0" max="${DAY_SECONDS}" step="900" value="${sim.timeSeconds}" aria-label="${t('simClock')}"><label class="sim-speed"><span>${t('simSpeedShort')}</span><select id="sim-speed" data-sim-param="speed">${[60, 600, 1800].map(value => `<option value="${value}" ${sim.speed === value ? 'selected' : ''}>${t('simSpeedOption', { minutes: value / 60 })}</option>`).join('')}</select></label></div></section>`;
  }

  function monthly(sim) {
    const max = Math.max(1, ...sim.forecast.months.map(m => m.energyKwh)), chosen = sim.forecast.months[sim.month - 1];
    return `<section class="panel sim-card"><div class="sim-card-head"><h2>${t('simMonthlyShort')}${help('simEnergy')}</h2><span class="sim-card-value">${monthName(sim.month)}: <b>${fmt(chosen.energyKwh / 1000, 1)}</b> ${t('simMwh')}</span></div><div class="month-bars" role="group" aria-label="${t('simMonthlyShort')}">${sim.forecast.months.map(m => `<button type="button" id="sim-bar-${m.month}" data-action="simulation-season" data-month="${m.month}" ${pressed(sim.month === m.month)} title="${monthName(m.month)}: ${fmt(m.energyKwh / 1000, 1)} ${t('simMwh')} · ${fmt(m.meanTemperature, 1)} °C" aria-label="${monthName(m.month)}: ${fmt(m.energyKwh / 1000, 1)} ${t('simMwh')}"><span class="bar-area"><i style="height:${Math.max(2, m.energyKwh / max * 100).toFixed(1)}%"></i></span><span class="month-name">${monthShort(m.month)}</span></button>`).join('')}</div></section>`;
  }

  /** Sequential single-hue heatmap: light = less energy per kWp, city blue = more. */
  function comparison(sim) {
    const monthly = sim.comparisonPeriod === 'month';
    const value = r => monthly ? r.months[sim.month - 1].energyKwh : r.annualEnergyKwh;
    const values = sim.comparisons.map(value), min = Math.min(...values), spread = Math.max(...values) - min || 1;
    const best = sim.comparisons.toSorted((a, b) => value(b) - value(a))[0];
    const axis = key => [...new Set(sim.comparisons.map(r => r[key]))].sort((a, b) => a - b), tilts = axis('tilt'), azimuths = axis('azimuth');
    return `<section class="panel sim-card orientation-panel"><div class="sim-card-head"><h2>${t('simCompareShort')}${help('simAngles')}</h2><div class="segmented compact" id="sim-comparison" role="group" aria-label="${t('simCompare')}">${[['annual', t('simCompareYear')], ['month', monthName(sim.month)]].map(([key, label]) => `<button type="button" id="sim-period-${key}" data-action="simulation-period" data-period="${key}" ${pressed((sim.comparisonPeriod || 'annual') === key)}>${label}</button>`).join('')}</div></div>
      <table class="orientation-table heatmap${sim.comparisonsStale ? ' is-stale' : ''}" title="${t('simCompareApply')}"><thead><tr><th scope="col"><span class="sr-only">${t('simTilt')}</span></th>${azimuths.map(az => `<th scope="col" title="${dir(az)}">${t('simDir' + shortDirection[az])}</th>`).join('')}</tr></thead><tbody>${tilts.map(tilt => `<tr><th scope="row">${tilt}°</th>${azimuths.map(az => {
        const r = sim.comparisons.find(r => r.tilt === tilt && r.azimuth === az), heat = (value(r) - min) / spread, selected = sim.tilt === tilt && sim.azimuth === az;
        return `<td><button type="button" id="sim-variant-${tilt}-${az}" data-action="simulation-variant" data-tilt="${tilt}" data-azimuth="${az}" class="${selected ? 'selected' : ''}${r === best ? ' best' : ''}${heat > 0.55 ? ' hot' : ''}" style="--heat:${heat.toFixed(3)}" aria-pressed="${selected}" aria-label="${tilt}°, ${dir(az)}: ${fmt(value(r))} ${t('simKwh')}/${t('simKwp')}">${fmt(value(r))}${r === best ? '<small aria-hidden="true">★</small>' : ''}</button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>
      <p class="sim-card-note best-configuration">${t('simBestShort', { tilt: best.tilt, direction: dir(best.azimuth) })} · ${t('simCompareHint', { gap: fmt(sim.rowGapM, 1) })}</p></section>`;
  }

  function results(sim) {
    const f = sim.forecast, fitted = sim.layout.panels.length, loss = f.rowShadeLossPercent;
    const tile = (label, value, unit, note, key, extra = '') => `<div class="sim-kpi simulation-metric ${extra}"><span>${label}${help(key)}</span><strong>${value}<small>${unit}</small></strong><em>${note}</em></div>`;
    return `<div class="sim-kpis simulation-primary-metrics">${[
      tile(t('simKpiYear'), fmt(f.annualEnergyKwh / 1000, 1), t('simMwh'), t('simKpiYield', { value: fmt(sim.capacityKwp ? f.annualEnergyKwh / sim.capacityKwp : 0) }), 'simEnergy', 'focus'),
      tile(t('simKpiDay'), fmt(sim.dayEnergyKwh), t('simKwh'), `${monthName(sim.month)} · ${t(scenarioKeys[sim.scenario])}`, 'simEnergy'),
      tile(t('simKpiPower'), fmt(sim.capacityKwp, 1), t('simKwp'), t('simKpiModules', { count: fmt(fitted), requested: fmt(sim.requestedPanelCount) }), 'simGeometry', fitted < sim.requestedPanelCount ? 'warn' : ''),
      tile(t('simKpiRowShade'), loss >= 0.05 ? '−' + fmt(loss, 1) : '0', '%', t('simKpiRows', { rows: fmt(sim.layout.rowCount), pitch: fmt(sim.rows.pitchM, 1) }), 'simRows', loss > 8 ? 'warn' : ''),
    ].join('')}</div>${fitted < sim.requestedPanelCount ? `<p class="warning-box sim-fit-warning">${t('simFitWarning')}</p>` : ''}${monthly(sim)}${comparison(sim)}`;
  }

  function about(sim) {
    const meteo = sim.climateMetadata.meteo;
    return `<details class="sim-about" data-disclosure="sim-method"><summary class="button compact">${icon('info')}<span>${t('simAbout')}</span></summary><div class="sim-popover sim-about-panel"><h2>${t('simMethod')}${help('simSnapshot')}</h2><p>${t('simNotice')}</p><p>${t('simMethodHelp')}</p><p>${t('simDaySource', { date: esc(sim.day.date), from: meteo.year_min, to: meteo.year_max })}</p><p class="model-comparison-note">${t('simPlanEnergy', { energy: fmt(sim.roof.annualEnergyKwh / 1000, 1), sketch: fmt(sim.forecast.annualEnergyKwh / 1000, 1) })}</p><p><a href="./SIMULATION.md" target="_blank" rel="noopener">${t('simMethod')} ↗</a></p></div></details>`;
  }

  function empty() {
    const roof = getSelectedRoof(), data = getSimulationData(), climate = Boolean(data.climate?.hours?.length);
    const available = climate && Boolean(data.geometry), plan = getPlanRoofs();
    return `<div class="sim-empty"><div class="page-heading"><div><div class="eyebrow">${t('simEyebrowShort')}</div><h1>${t('simTitle')}</h1><p>${t('simDescription')}</p></div></div>${!available ? `<p class="notice error">${t('simDataMissing')}</p>` : ''}<div class="sim-empty-grid"><section class="panel sim-empty-card"><h2>${t('simEmptyRoof')}</h2><p class="sim-empty-roof">${roof ? roofTitle(roof) : t('simNoRoof')}</p><div class="sim-empty-actions"><button class="button primary" data-action="simulation-create" ${roof && available ? '' : 'disabled'}>${icon('sun')}${t('simCreateSelected')}</button><button class="button" data-action="simulation-choose">${t('simChooseRoof')}</button></div></section>${plan.length ? `<section class="panel sim-empty-card"><h2>${t('simPickTitle')}</h2><div class="sim-pick">${plan.map((r, i) => `<button type="button" data-action="simulate-roof" data-id="${esc(r.id)}" ${climate ? '' : 'disabled'}><span class="roof-rank">${i + 1}</span><b>${roofTitle(r)}</b><small>${fmt(r.annualEnergyKwh / 1000, 1)} ${t('simMwhYear')}</small></button>`).join('')}</div></section>` : ''}</div></div>`;
  }

  function html() {
    const sim = getSimulation();
    if (!sim) return empty();
    const meteo = sim.climateMetadata.meteo;
    return `<div class="sim-app"><div class="sim-bar"><div class="sim-title"><h1>${esc(sim.roof.name)}</h1><p class="sim-sources"><span class="hash">${esc(sim.roof.id)}</span><a href="${esc(solarRecordUrl(sim.roof.id))}" target="_blank" rel="noopener">${t('simSourceRoof')} ↗</a><a href="${esc(sim.climateMetadata.source.url)}" target="_blank" rel="noopener">${t('simSourceClimate', { from: meteo.year_min, to: meteo.year_max })} ↗</a></p></div><div class="sim-actions"><button class="button compact" data-action="simulation-map">${icon('pin')}${t('simMapShort')}</button><button class="button compact" data-action="simulation-choose">${icon('swap')}${t('simChooseShort')}</button><button class="button compact" data-action="simulation-json">${icon('download')}JSON</button><button class="button compact" data-action="simulation-csv">${icon('download')}CSV</button>${about(sim)}</div></div>
      <div class="sim-grid"><aside class="panel sim-controls" id="sim-controls" aria-label="${t('simPlacement')}">${controls(sim)}</aside>${stage(sim)}<div class="sim-results" id="sim-results">${results(sim)}</div></div></div>`;
  }

  return {
    html, frame, playButton,
    dayChart: () => getSimulation() ? dayChart(getSimulation()) : '',
    dayCaption: () => getSimulation() ? dayCaption(getSimulation()) : '',
    controls: () => getSimulation() ? controls(getSimulation()) : '',
    optimizer: () => getSimulation() ? optimizer(getSimulation()) : '',
    results: () => getSimulation() ? results(getSimulation()) : '',
  };
}
