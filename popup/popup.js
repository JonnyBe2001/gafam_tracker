const COMPANY_ORDER = [
  { key: 'google', label: 'Google', color: '#1f77ff' },
  { key: 'apple', label: 'Apple', color: '#5e35b1' },
  { key: 'facebook', label: 'Meta', color: '#d81b60' },
  { key: 'amazon', label: 'Amazon', color: '#ff8f00' },
  { key: 'microsoft', label: 'Microsoft', color: '#00a651' }
];

const NON_GAFAM = { key: 'other', label: 'Nicht-GAFAM', color: '#546e7a' };

document.addEventListener('DOMContentLoaded', () => {
  void initializePopup();
});

async function initializePopup() {
  const data = await loadTrackingData();
  renderSummary(data);
  renderUnifiedChart(data);
  renderCompanyBars(data);
  renderPageList(data);

  document.getElementById('export-data').addEventListener('click', () => {
    exportCsv(data);
  });
}

async function loadTrackingData() {
  const data = await browser.storage.local.get(['trackingData', 'totalTime', 'gafamTime']);
  const trackingData = data.trackingData || {
    totalTime: data.totalTime || 0,
    gafamTime: data.gafamTime || 0,
    providerTotals: {},
    companyTotals: {},
    pageTotals: {},
    visitLog: []
  };

  trackingData.providerTotals = trackingData.providerTotals || {};
  trackingData.companyTotals = trackingData.companyTotals || {};
  trackingData.pageTotals = trackingData.pageTotals || {};
  trackingData.visitLog = Array.isArray(trackingData.visitLog) ? trackingData.visitLog : [];
  return trackingData;
}

function renderSummary(data) {
  const totalTime = data.totalTime || 0;
  const gafamTime = data.gafamTime || 0;
  const percentage = totalTime > 0 ? Math.round((gafamTime / totalTime) * 100) : 0;
  const trackedPages = Object.keys(data.pageTotals || {}).length;

  document.getElementById('total-time').textContent = formatSeconds(totalTime);
  document.getElementById('gafam-time').textContent = formatSeconds(gafamTime);
  document.getElementById('percentage').textContent = percentage;
  document.getElementById('tracked-pages').textContent = trackedPages;
}

function renderUnifiedChart(data) {
  const canvas = document.getElementById('market-chart');
  const legend = document.getElementById('provider-legend');
  const providers = [...COMPANY_ORDER, NON_GAFAM];
  const values = providers.map((provider) => data.providerTotals?.[provider.key] || 0);
  const total = values.reduce((sum, value) => sum + value, 0);

  drawDonutChart(canvas, {
    values,
    colors: providers.map((provider) => provider.color),
    centerLabel: 'Gesamt',
    centerValue: total,
    maxSize: 280
  });

  const baseLegend = providers.map((provider) => {
    const value = data.providerTotals?.[provider.key] || 0;
    const share = total > 0 ? Math.round((value / total) * 100) : 0;
    return `
      <div class="legend-item">
        <span class="legend-swatch" style="background: ${provider.color}"></span>
        <span class="legend-label">${provider.label}</span>
        <strong>${formatSeconds(value)}s · ${share}%</strong>
      </div>
    `;
  }).join('');

  legend.innerHTML = baseLegend;
}

function renderCompanyBars(data) {
  const container = document.getElementById('company-bars');
  const totals = COMPANY_ORDER.map((company) => ({
    ...company,
    value: data.companyTotals?.[company.key] || 0
  }));
  const maxValue = Math.max(...totals.map((entry) => entry.value), 0);

  container.innerHTML = totals.map((entry) => {
    const width = maxValue > 0 ? Math.max(6, Math.round((entry.value / maxValue) * 100)) : 0;
    return `
      <div class="bar-row">
        <div class="bar-meta">
          <span>${entry.label}</span>
          <strong>${formatSeconds(entry.value)}</strong>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${width}%; background: ${entry.color}"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPageList(data) {
  const container = document.getElementById('page-list');
  const pageEntries = Object.values(data.pageTotals || {})
    .filter((entry) => COMPANY_ORDER.some((company) => company.key === entry.companyKey))
    .sort((left, right) => right.durationSeconds - left.durationSeconds)
    .slice(0, 8);

  if (!pageEntries.length) {
    container.innerHTML = '<div class="empty-state">Noch keine Seiten erfasst.</div>';
    return;
  }

  container.innerHTML = pageEntries.map((entry) => `
    <article class="page-item">
      <div class="page-copy">
        <h3>${escapeHtml(entry.title || entry.url)}</h3>
        <p>${escapeHtml(entry.companyLabel || 'Unbekannt')}</p>
      </div>
      <div class="page-duration">
        <strong>${formatSeconds(entry.durationSeconds || 0)}</strong>
        <span>besucht</span>
      </div>
    </article>
  `).join('');
}

function exportCsv(data) {
  const headers = ['type', 'company', 'page_title', 'page_url', 'duration_seconds', 'started_at', 'ended_at'];
  const rows = [headers.join(',')];

  (data.visitLog || []).forEach((entry) => {
    rows.push([
      'visit',
      csvValue(entry.companyLabel || entry.companyKey || ''),
      csvValue(entry.title || ''),
      csvValue(entry.url || ''),
      csvValue(roundSeconds(entry.durationSeconds || 0)),
      csvValue(entry.startedAt || ''),
      csvValue(entry.endedAt || '')
    ].join(','));
  });

  if ((data.visitLog || []).length === 0) {
    Object.values(data.pageTotals || {}).forEach((entry) => {
      rows.push([
        'page_summary',
        csvValue(entry.companyLabel || entry.companyKey || ''),
        csvValue(entry.title || ''),
        csvValue(entry.url || ''),
        csvValue(roundSeconds(entry.durationSeconds || 0)),
        '',
        ''
      ].join(','));
    });
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'gafam-tracker-export.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function drawDonutChart(canvas, config) {
  const { values, colors, centerLabel, centerValue, maxSize = 240 } = config;

  const context = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const size = Math.min(canvas.parentElement.clientWidth, maxSize);
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  context.scale(ratio, ratio);

  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const center = size / 2;
  const padding = Math.max(20, Math.round(size * 0.12));
  const ringThickness = Math.max(18, Math.round(size * 0.16));
  const radius = center - padding - ringThickness / 2;

  context.clearRect(0, 0, size, size);
  context.lineCap = 'butt';

  drawRing(context, center, radius, ringThickness, values, colors, total);

  context.fillStyle = '#0f172a';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '600 16px Segoe UI, Arial, sans-serif';
  context.fillText(centerLabel, center, center - 10);
  context.font = '700 20px Segoe UI, Arial, sans-serif';
  context.fillText(formatSeconds(centerValue), center, center + 14);
}

function drawRing(context, center, radius, lineWidth, values, colors, baseTotal) {
  let startAngle = -Math.PI / 2;
  const total = values.reduce((sum, value) => sum + value, 0) || baseTotal || 1;

  values.forEach((value, index) => {
    const segmentAngle = (value / total) * Math.PI * 2;
    context.beginPath();
    context.arc(center, center, radius, startAngle, startAngle + segmentAngle);
    context.lineWidth = lineWidth;
    context.strokeStyle = colors[index];
    context.stroke();
    startAngle += segmentAngle;
  });
}

function formatSeconds(value) {
  return Math.round(value).toLocaleString('de-DE');
}

function roundSeconds(value) {
  return Math.round(value * 100) / 100;
}

function csvValue(value) {
  const text = String(value ?? '');
  if (/[\",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}