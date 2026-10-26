export function createMonitoringView({ getMonitoring, t, fmt, esc, icon, heading, kpi, formatDate }) {
  function chart(record, maxGapSeconds) {
    const rows = record.samples, start = Date.parse(rows[0].timestamp), end = Date.parse(rows.at(-1).timestamp);
    const maxPower = Math.max(...rows.map(r => r.powerW), 0.001);
    const groups = [[]];
    for (const row of rows) {
      const group = groups.at(-1), previous = group.at(-1);
      if (previous && Date.parse(row.timestamp) - Date.parse(previous.timestamp) > maxGapSeconds * 1000) groups.push([]);
      groups.at(-1).push(row);
    }
    const x = row => (35 + (Date.parse(row.timestamp) - start) / Math.max(1, end - start) * 600).toFixed(2);
    const y = row => (155 - row.powerW / maxPower * 125).toFixed(2);
    const shapes = groups.map(group => {
      // Keep minima and maxima in each bucket; never join across missing intervals.
      const step = Math.max(1, Math.ceil(group.length / 250)), points = [group[0]];
      for (let i = 0; i < group.length; i += step) {
        const bucket = group.slice(i, i + step);
        const min = bucket.reduce((a, b) => a.powerW < b.powerW ? a : b);
        const max = bucket.reduce((a, b) => a.powerW > b.powerW ? a : b);
        points.push(...[min, max].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)));
      }
      points.push(group.at(-1));
      return group.length === 1 ? `<circle cx="${x(group[0])}" cy="${y(group[0])}" r="2" fill="currentColor"/>`
        : `<polyline points="${points.map(row => `${x(row)},${y(row)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/>`;
    }).join('');
    return `<figure class="power-chart"><figcaption>${t('powerChart')}</figcaption><svg viewBox="0 0 660 180" role="img" aria-label="${t('powerChart')}"><title>${t('powerChart')}</title><path d="M35 20V155H640" fill="none" stroke="#ced8c8"/><text x="0" y="25">${fmt(maxPower, 1)}</text><text x="10" y="155">0</text>${shapes}</svg><div class="chart-dates"><span>${esc(formatDate(rows[0].timestamp))}</span><span>${esc(formatDate(rows.at(-1).timestamp))}</span></div></figure>`;
  }

  return function monitoringView() {
    const m = getMonitoring(), record = m.record, summary = m.summary;
    const field = (key, label, min, max, step) => `<div class="field"><label for="monitor-${key}">${label}</label><input class="small-input" id="monitor-${key}" data-monitor-param="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${m.settings[key] ?? ''}" placeholder="${t('ratePlaceholder')}"></div>`;
    const live = m.connection === 'live', waiting = m.connected && !live;
    const mode = live ? 'modeLive' : waiting ? 'modeWaiting' : record?.mode === 'example' ? 'modeExample' : 'modeRecording';
    const controls = `<div class="monitor-controls"><label class="button ${m.connected ? 'disabled' : ''}">${icon('download')}${t('measurementImport')}<input id="measurement-file" type="file" accept="application/json,.json" ${m.connected ? 'disabled' : ''}></label><button class="button" data-action="monitor-example" ${m.connected ? 'disabled' : ''}>${t('measurementExample')}</button>${record ? `<button class="button" data-action="monitor-export" ${record.samples.length < 2 ? 'disabled' : ''}>${t('measurementExport')}</button><button class="button" data-action="monitor-clear" ${m.connected ? 'disabled' : ''}>${t('measurementClear')}</button>` : ''}<a class="button" href="./MONITORING.md" target="_blank" rel="noopener">${t('measurementFormat')} ↗</a></div>`;
    const currentPower = waiting ? null : summary?.lastPowerW;
    const metrics = `<div class="kpis">${kpi(t(live ? 'powerNow' : 'lastMeasuredPower'), currentPower == null ? '—' : fmt(currentPower, 2), t('watts'), record ? t(mode) : t('monitorNoData'), 'sun', true)}${kpi(t('measuredEnergy'), summary?.energyWh == null ? '—' : fmt(summary.energyWh, 3), t('wattHours'), summary?.observedSeconds ? t('gapNote') : t('noCoverage'), 'chart')}${kpi(t('measuredDuration'), summary ? fmt(summary.observedSeconds, 1) : '—', t('seconds'), '', 'chart')}${kpi(t('measurementGaps'), summary ? fmt(summary.gapCount) : '—', '', t('gapNote'), 'info')}</div>`;
    const site = record?.installation;
    const content = record ? `<section class="panel document-section monitor-record"><div class="monitor-record-heading"><h2>${esc(site.name)}</h2><span class="tag ${record.mode === 'example' ? 'amber' : live ? '' : 'gray'}">${t(mode)}</span></div><p>${t(site.kind === 'bench' ? 'benchScope' : 'recordingScope')}</p>${summary?.firstTimestamp ? `<p>${t('measurementPeriod', { start: esc(formatDate(summary.firstTimestamp)), end: esc(formatDate(summary.lastTimestamp)), count: summary.sampleCount })}</p>` : ''}${record.samples.length > 1 ? chart(record, m.settings.maxGapSeconds) : ''}${site.sourceUrl ? `<a href="${esc(site.sourceUrl)}" target="_blank" rel="noopener">${t('installationSource')} ↗</a>` : ''}${site.location ? `<button class="button" data-action="monitor-map">${t('installationOnMap')}</button>` : ''}</section>` : `<section class="panel document-section"><h2>${t('monitorNoData')}</h2><p>${t('monitorNoDataHelp')}</p></section>`;
    const finance = `<section class="panel document-section"><h2>${t('financialTitle')}</h2><div class="monitor-settings">${field('buyRatePln', t('buyRate'), 0, 100, 0.01)}${field('sellRatePln', t('sellRate'), 0, 100, 0.01)}</div><div class="financial-value">${summary?.financialEffectPln == null ? '—' : fmt(summary.financialEffectPln, 2) + ' zł'}</div><p>${t(site?.kind === 'bench' ? 'financialBench' : summary?.financialEffectPln == null ? 'financialMissing' : 'financialHelp')}</p>${summary?.selfConsumedWh != null && site?.kind === 'pv' ? `<p>${t('measuredSelf')}: ${fmt(summary.selfConsumedWh / 1000, 3)} ${t('kwhYear').split('/')[0]}<br>${t('measuredExport')}: ${fmt(summary.exportWh / 1000, 3)} ${t('kwhYear').split('/')[0]}</p>` : ''}</section>`;
    return `${heading(t('monitorTitle'), t('monitorDescription'), t('monitorEyebrow'))}${controls}<p class="monitor-local">${t('monitorLocal')}</p>${m.error ? `<div class="notice error" role="alert">${t(m.error)}</div>` : ''}${metrics}<div class="monitor-grid"><div class="monitor-stack">${content}${finance}</div><div class="monitor-stack"><section class="panel document-section"><h2>${t('serialTitle')}</h2><p>${t('serialHelp')}</p><button class="button primary" data-action="${m.connected ? 'serial-disconnect' : 'serial-connect'}" ${!m.serialSupported ? 'disabled' : ''}>${t(m.connected ? 'serialDisconnect' : 'serialConnect')}</button>${!m.serialSupported ? `<p>${t('serialUnsupported')}</p>` : ''}${m.connected ? `<p role="status">${t(mode)}</p>` : ''}</section><section class="panel document-section"><h2>${t('monitorSettings')}</h2>${field('maxGapSeconds', t('maxGap'), 0.001, 86400, 0.001)}<p>${t('gapNote')}</p></section><section class="panel document-section"><h2>${t('ozeToggle')}</h2><p>${t('ozeHelp')}</p><a href="https://msip.krakow.pl/dataset/2842" target="_blank" rel="noopener">MSIP · WS instalacje OZE ↗</a></section></div></div>`;
  };
}
