export function renderDualLineChart(history, lang = 'de') {
  if (!history || history.length < 2) {
    return `<div class="h-44 flex items-center justify-center text-xs text-slate-400 border border-slate-800 rounded-lg">
      ${lang === 'de' ? 'Sammle Finanzdaten (erste Buchungen laufen)...' : 'Collecting financial telemetry...'}
    </div>`;
  }

  const w = 640;
  const h = 190;
  const padX = 48;
  const padY = 20;

  const netVals = history.map((d) => Number(d.net_worth || 0));
  const revVals = history.map((d) => Number(d.revenue_hr || 0));
  const expVals = history.map((d) => Number(d.expenses_hr || 0));

  const maxNet = Math.max(...netVals, 10000);
  const minNet = Math.min(...netVals, 0);
  const netSpan = Math.max(1, maxNet - minNet);

  const toPoints = (arr, minV, span) =>
    arr
      .map((val, idx) => {
        const x = padX + (idx / Math.max(1, arr.length - 1)) * (w - padX * 1.4);
        const y = h - padY - ((val - minV) / span) * (h - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const netPts = toPoints(netVals, minNet, netSpan);
  const maxFlow = Math.max(...revVals, ...expVals, 500);
  const revPts = toPoints(revVals, 0, maxFlow);
  const expPts = toPoints(expVals, 0, maxFlow);

  return `
    <div class="card-surface rounded-xl p-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div class="text-sm font-semibold text-slate-100">
          ${lang === 'de' ? 'Vermögens- & Cashflow-Entwicklung' : 'Net Worth & Cashflow Trajectory'}
        </div>
        <div class="flex items-center gap-4 text-xs text-slate-300">
          <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-0.5 bg-sky-400"></span>${lang === 'de' ? 'Gesamtvermögen' : 'Net Worth'}</span>
          <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-0.5 bg-emerald-400"></span>${lang === 'de' ? 'Einnahmen/h' : 'Rev/hr'}</span>
          <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-0.5 bg-rose-400"></span>${lang === 'de' ? 'Ausgaben/h' : 'Exp/hr'}</span>
        </div>
      </div>
      <svg viewBox="0 0 ${w} ${h}" class="w-full h-44 overflow-visible">
        <line x1="${padX}" y1="${padY}" x2="${w - 16}" y2="${padY}" stroke="rgba(148,163,184,0.14)" stroke-dasharray="3 3" />
        <line x1="${padX}" y1="${h / 2}" x2="${w - 16}" y2="${h / 2}" stroke="rgba(148,163,184,0.14)" stroke-dasharray="3 3" />
        <line x1="${padX}" y1="${h - padY}" x2="${w - 16}" y2="${h - padY}" stroke="rgba(148,163,184,0.22)" />
        <text x="4" y="${padY + 4}" fill="#94a3b8" font-size="10" font-family="JetBrains Mono">$${Math.round(maxNet / 1000)}k</text>
        <text x="4" y="${h - padY}" fill="#94a3b8" font-size="10" font-family="JetBrains Mono">$${Math.round(minNet / 1000)}k</text>
        <polyline fill="none" stroke="#10b981" stroke-width="2" stroke-opacity="0.8" points="${revPts}" />
        <polyline fill="none" stroke="#fb7185" stroke-width="2" stroke-opacity="0.8" points="${expPts}" />
        <polyline fill="none" stroke="#38bdf8" stroke-width="2.6" points="${netPts}" />
      </svg>
    </div>
  `;
}

export function renderSparkline(values, positive = true) {
  if (!values || values.length < 2) return '';
  const w = 96;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 3 - ((v - min) / span) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const stroke = positive ? '#10b981' : '#fb7185';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="shrink-0"><polyline fill="none" stroke="${stroke}" stroke-width="1.8" points="${pts}" /></svg>`;
}
