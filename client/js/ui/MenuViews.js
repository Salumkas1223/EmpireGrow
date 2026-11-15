import { t, locName, locDesc, getLanguage } from '../../../localization/i18n.js';
import { renderDualLineChart, renderSparkline } from '../economy/FinancialCharts.js';
import { store } from '../core/StateStore.js';
import { getUpgradeDurationSec } from '../../../shared/gameData.ts';

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

export function renderMenuContent(menuId) {
  const st = store.state;
  const cat = store.catalog;
  if (!st || !cat) return '';
  const lang = getLanguage();
  const fin = st.financials;

  const techCompleted = new Set((st.research || []).filter((r) => r.status === 'completed').map((r) => r.tech_id));
  const techResearching = new Map((st.research || []).filter((r) => r.status === 'researching').map((r) => [r.tech_id, r]));

  switch (menuId) {
    case 'dashboard': {
      const topCompany = st.companies[0];
      return `
        <div class="space-y-5">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            ${kpiCard(t('kpi.balance'), fmt(fin.cash), 'text-sky-400')}
            ${kpiCard(t('kpi.netWorth'), fmt(fin.netWorth), 'text-white')}
            ${kpiCard(t('kpi.profitHr'), (fin.netProfitPerHour >= 0 ? '+' : '') + fmt(fin.netProfitPerHour), fin.netProfitPerHour >= 0 ? 'text-emerald-400' : 'text-rose-400')}
            ${kpiCard(t('kpi.compValue'), fmt(fin.companyValue), 'text-amber-400')}
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="card-surface rounded-xl p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Schnellaktionen' : 'Executive Quick Actions'}</h3>
                <span class="text-xs text-slate-400">${st.player.empire_name}</span>
              </div>
              <div class="grid grid-cols-2 gap-2.5">
                <button data-action="open-menu" data-menu="plots" class="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-left transition-colors cursor-pointer">
                  ${t('nav.plots')} (${fin.plotsCount}/${cat.plots.length})
                </button>
                <button data-action="open-menu" data-menu="companies" class="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-left transition-colors cursor-pointer">
                  ${t('nav.companies')} (${st.companies.length})
                </button>
                <button data-action="open-menu" data-menu="construction" class="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-left transition-colors cursor-pointer">
                  ${t('nav.construction')} (${fin.buildingsCount})
                </button>
                <button data-action="open-menu" data-menu="research" class="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-left transition-colors cursor-pointer">
                  ${t('nav.research')} (${techCompleted.size}/${cat.technologies.length})
                </button>
              </div>
              ${topCompany ? `
                <div class="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span class="text-slate-400">${lang === 'de' ? 'Führendes Unternehmen' : 'Flagship Company'}: <strong class="text-slate-100">${topCompany.name}</strong></span>
                  <span class="font-mono-num text-emerald-400">${t('labels.reputation')}: ${Math.round(topCompany.reputation)}%</span>
                </div>
              ` : `
                <div class="pt-3 border-t border-slate-800 text-xs text-amber-300">
                  ${lang === 'de' ? 'Tipp: Du startest mit $100.000 Startkapital — wähle ein freies Grundstück auf der Karte, kaufe es und baue dein erstes Gebäude!' : 'Tip: You start with $100,000 capital — select an available plot on the map, purchase it, and construct your first building!'}
                </div>
              `}
            </div>

            <div class="card-surface rounded-xl p-4 space-y-2.5">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Makroökonomie & Stadtstatus' : 'Macroeconomy & City Status'}</h3>
                <span class="text-xs font-mono-num text-sky-400">${t('cycle.' + st.world.economicCycle)}</span>
              </div>
              <div class="text-xs text-slate-300 bg-slate-900/70 border border-slate-800 rounded-lg px-2.5 py-2">
                ${lang === 'de' ? st.world.marketHeadlineDe : st.world.marketHeadlineEn}
              </div>
              <div class="grid grid-cols-2 gap-y-1.5 text-xs pt-1">
                <span class="text-slate-400">${t('kpi.revHr')}</span>
                <span class="text-right font-mono-num text-emerald-400">+${fmt(fin.revenuePerHour)}</span>
                <span class="text-slate-400">${t('kpi.expHr')}</span>
                <span class="text-right font-mono-num text-rose-400">-${fmt(fin.expensesPerHour)}</span>
                <span class="text-slate-400">${lang === 'de' ? 'Operative Marge' : 'Operating Margin'}</span>
                <span class="text-right font-mono-num ${fin.operatingMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fin.operatingMargin}%</span>
                <span class="text-slate-400">${lang === 'de' ? 'Lieferketten-Effizienz' : 'Supply Chain Eff.'}</span>
                <span class="text-right font-mono-num text-sky-400">${fin.supplyChainEfficiency}%</span>
                <span class="text-slate-400">${t('kpi.energy')}</span>
                <span class="text-right font-mono-num text-slate-200">${fin.energyGenerated} / ${fin.energyUsed} MW</span>
                <span class="text-slate-400">${lang === 'de' ? 'Inflation / Leitzins' : 'Inflation / Credit Rate'}</span>
                <span class="text-right font-mono-num text-slate-200">${(st.world.inflationRate * 100).toFixed(1)}% · ${fin.interestRate}%</span>
              </div>
            </div>
          </div>

          ${renderDualLineChart(st.financialHistory, lang)}
        </div>
      `;
    }

    case 'city': {
      const districts = Object.values(cat.districts);
      const hour = st.world.gameHour % 24;
      const day = Math.floor(st.world.gameHour / 24) + 1;
      return `
        <div class="space-y-4">
          <div class="card-surface rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">${lang === 'de' ? 'Metropole Live-Status' : 'Metropolis Live Status'}</div>
              <div class="text-base font-semibold text-white font-mono-num">
                ${lang === 'de' ? 'Tag' : 'Day'} ${day} · ${String(hour).padStart(2, '0')}:00 · ${t('weather.' + st.world.weather)}
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button data-action="cam-preset" data-preset="overview" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">${t('dock.overview')}</button>
              <button data-action="cam-preset" data-preset="downtown" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">${t('dock.downtown')}</button>
              <button data-action="cam-preset" data-preset="harbor" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">${t('dock.harbor')}</button>
              <button data-action="cam-preset" data-preset="airport" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">${t('dock.airport')}</button>
              <button data-action="cam-preset" data-preset="industrial" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">${t('dock.industrial')}</button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            ${districts
              .map((d) => {
                const districtPlots = cat.plots.filter((p) => p.district === d.id);
                const ownedHere = districtPlots.filter((p) => st.ownedPlots.includes(p.id)).length;
                return `
                  <div class="card-surface rounded-xl p-4 space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-semibold text-white">${locName(d)}</span>
                      <span class="text-xs font-mono-num text-slate-400">${ownedHere}/${districtPlots.length}</span>
                    </div>
                    <div class="text-xs text-sky-400">${locDesc(d)}</div>
                    <div class="text-xs text-slate-400 flex justify-between pt-2 border-t border-slate-800">
                      <span>${lang === 'de' ? 'Steuersatz' : 'Tax Rate'}: ${(d.taxRate * 100).toFixed(0)}%</span>
                      <span>${lang === 'de' ? 'Bodenpreis' : 'Land Index'}: ${d.landMultiplier}x</span>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    case 'plots': {
      const ownedSet = new Set(st.ownedPlots);
      const bldByPlot = new Map(st.buildings.map((b) => [b.plot_id, b]));
      return `
        <div class="space-y-3">
          <div class="text-xs text-slate-400">
            ${lang === 'de' ? `Klicke ein Grundstück in der 3D-Stadt oder verwalte deine ${cat.plots.length} Parzellen direkt hier.` : `Click any plot in 3D or manage all ${cat.plots.length} city parcels below.`}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            ${cat.plots
              .map((p) => {
                const owned = ownedSet.has(p.id);
                const bld = bldByPlot.get(p.id);
                const d = cat.districts[p.district];
                const bDef = bld ? cat.buildings.find((x) => x.id === bld.building_type) : null;
                return `
                  <div class="card-surface rounded-lg p-3 flex flex-col justify-between gap-2">
                    <div>
                      <div class="flex items-center justify-between text-xs">
                        <span class="font-mono-num font-semibold text-white">${p.code}</span>
                        <span class="${owned ? 'text-emerald-400' : 'text-slate-400'}">${owned ? t('labels.owned') : t('labels.available')}</span>
                      </div>
                      <div class="text-xs text-slate-400 mt-0.5">${locName(d)}</div>
                      <div class="text-xs text-sky-300 mt-1">
                        ${bDef ? `${locName(bDef)} (Lv.${bld.level})` : owned ? (lang === 'de' ? 'Frei zum Bauen' : 'Ready to build') : fmt(p.basePrice)}
                      </div>
                    </div>
                    <div class="flex gap-2 pt-1">
                      <button data-action="focus-plot" data-plot="${p.id}" class="flex-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer">
                        ${lang === 'de' ? 'Kamera' : 'Focus'}
                      </button>
                      ${
                        !owned
                          ? `<button data-action="buy-plot" data-plot="${p.id}" class="flex-1 px-2.5 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">${t('actions.buy')}</button>`
                          : `<button data-action="select-plot-build" data-plot="${p.id}" class="flex-1 px-2.5 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs cursor-pointer">${bDef ? t('actions.customize') : t('actions.construct')}</button>`
                      }
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    case 'construction': {
      const selPlot = store.selectedPlotId;
      const ownedSet = new Set(st.ownedPlots);
      const selectedOwned = selPlot && ownedSet.has(selPlot);
      const existingOnSel = selPlot ? st.buildings.find((b) => b.plot_id === selPlot) : null;

      return `
        <div class="space-y-4">
          <div class="card-surface rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs">
              ${
                selPlot
                  ? `<span class="text-slate-300">${lang === 'de' ? 'Ausgewähltes Grundstück' : 'Selected Plot'}: <strong class="text-sky-400 font-mono-num">${selPlot}</strong></span>`
                  : `<span class="text-amber-300">${lang === 'de' ? 'Wähle zuerst ein eigenes Grundstück in der 3D-Stadt oder unter Grundstücke.' : 'Select one of your owned plots in 3D or under Land Plots.'}</span>`
              }
            </div>
            <div class="flex items-center gap-2">
              <button data-action="rotate-preview" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs cursor-pointer">
                ${t('dock.rotate')}: ${store.buildRotation * 90}°
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            ${cat.buildings
              .map((b) => {
                const unlocked = !b.requiredTech || techCompleted.has(b.requiredTech);
                const reqTech = b.requiredTech ? cat.technologies.find((x) => x.id === b.requiredTech) : null;
                const mats = Object.entries(b.materials)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(' · ');
                return `
                  <div class="card-surface rounded-xl p-4 flex flex-col justify-between gap-3 ${unlocked ? '' : 'opacity-70'}">
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-semibold text-white">${locName(b)}</span>
                        <span class="text-xs font-mono-num text-sky-400">${fmt(b.cost)}</span>
                      </div>
                      <div class="flex items-center justify-between text-xs text-slate-400">
                        <span>${mats}</span>
                        <span class="font-mono-num text-amber-300">⏱ ${b.buildTimeSec}s</span>
                      </div>
                      <div class="grid grid-cols-2 gap-1 text-xs pt-1 text-slate-300 font-mono-num">
                        <span>${t('labels.revenue')}: +${fmt(b.baseRevenuePerHour)}</span>
                        <span>${t('labels.maintenance')}: -${fmt(b.maintenancePerHour)}</span>
                        <span>${t('labels.slots')}: ${b.employeeSlots}</span>
                        <span>${t('labels.power')}: ${b.energyOutputPerHour > 0 ? '+' + b.energyOutputPerHour : '-' + b.energyUsePerHour} MW</span>
                      </div>
                    </div>
                    ${
                      !unlocked
                        ? `<div class="text-xs text-amber-400">${t('labels.locked')}: ${locName(reqTech)}</div>`
                        : selectedOwned && !existingOnSel
                        ? `<button data-action="construct-building" data-type="${b.id}" class="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">${t('actions.construct')}</button>`
                        : `<div class="text-xs text-slate-500">${existingOnSel ? (lang === 'de' ? 'Grundstück bereits bebaut' : 'Plot already occupied') : (lang === 'de' ? 'Freies eigenes Grundstück wählen' : 'Select an empty owned plot')}</div>`
                    }
                  </div>
                `;
              })
              .join('')}
          </div>

          ${
            st.buildings.length > 0
              ? `
            <div class="pt-2">
              <h3 class="text-sm font-semibold text-white mb-2.5">${lang === 'de' ? 'Aktive Bauwerke verwalten' : 'Manage Active Buildings'}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                ${st.buildings
                  .map((b) => {
                    const def = cat.buildings.find((x) => x.id === b.building_type);
                    const upCost = def ? Math.round(def.cost * 0.72 * b.level) : 0;
                    const upSec = def ? getUpgradeDurationSec(def.buildTimeSec, b.level) : 20;
                    const canUp = def && b.level < def.maxLevel && b.is_constructing === 0;
                    const remSec = b.is_constructing ? Math.max(1, Math.ceil((b.build_completes_at - Date.now()) / 1000)) : 0;
                    return `
                      <div class="card-surface rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div class="text-xs font-semibold text-white">${locName(def)} · ${t('labels.level')} ${b.level}</div>
                          <div class="text-xs text-slate-400 font-mono-num">${b.plot_id} · ${b.is_constructing ? `${t('labels.constructing')} (${remSec}s)` : t('labels.operational')}</div>
                        </div>
                        <div class="flex gap-1.5">
                          ${
                            canUp
                              ? `<button data-action="upgrade-building" data-id="${b.id}" class="px-2.5 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer">${t('actions.upgrade')} (${fmt(upCost)} · ${upSec}s)</button>`
                              : ''
                          }
                          <button data-action="rotate-building" data-id="${b.id}" data-rot="${(b.rotation + 1) % 4}" class="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs cursor-pointer">90°</button>
                          <button data-action="demolish-building" data-id="${b.id}" class="px-2.5 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs cursor-pointer">${t('actions.demolish')}</button>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>`
              : ''
          }
        </div>
      `;
    }

    case 'companies': {
      return `
        <div class="space-y-5">
          <div class="card-surface rounded-xl p-4">
            <h3 class="text-sm font-semibold text-white mb-3">${t('actions.foundCompany')}</h3>
            <form id="found-company-form" class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input id="company-name-input" type="text" placeholder="${lang === 'de' ? 'Firmenname z.B. Nova Tech AG' : 'Company name e.g. Nova Tech Corp'}" required maxlength="40"
                class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-400" />
              <select id="company-industry-select" class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white">
                ${cat.industries.map((ind) => `<option value="${ind.id}">${locName(ind)} (${fmt(ind.foundingCost)})</option>`).join('')}
              </select>
              <button type="submit" class="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">
                ${t('actions.foundCompany')}
              </button>
            </form>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${
              st.companies.length === 0
                ? `<div class="col-span-full text-xs text-slate-400 p-4 text-center card-surface rounded-xl">${lang === 'de' ? 'Noch kein Unternehmen gegründet.' : 'No companies founded yet.'}</div>`
                : st.companies
                    .map((c) => {
                      const ind = cat.industries.find((x) => x.id === c.industry_id);
                      const assignedBuildings = st.buildings.filter((b) => b.company_id === c.id).length;
                      const assignedStaff = st.employees.filter((e) => e.company_id === c.id).length;
                      return `
                        <div class="card-surface rounded-xl p-4 space-y-3">
                          <div class="flex items-start justify-between gap-2">
                            <div>
                              <div class="text-sm font-semibold text-white">${c.name}</div>
                              <div class="text-xs text-sky-400">${locName(ind)}</div>
                            </div>
                            <span class="text-xs font-mono-num text-emerald-400">${t('labels.reputation')}: ${Math.round(c.reputation)}%</span>
                          </div>
                          <div class="grid grid-cols-2 gap-2 text-xs font-mono-num text-slate-300">
                            <span>${t('kpi.buildings')}: ${assignedBuildings}</span>
                            <span>${t('kpi.employees')}: ${assignedStaff}</span>
                            <span>${lang === 'de' ? 'Umsatz gesamt' : 'Total Rev'}: ${fmt(c.revenue_total)}</span>
                            <span>${lang === 'de' ? 'Marktanteil' : 'Market Share'}: ${Number(c.market_share).toFixed(1)}%</span>
                          </div>
                          <div class="pt-2 border-t border-slate-800 space-y-2">
                            <div class="flex items-center justify-between text-xs">
                              <span class="text-slate-400">${t('labels.priceMultiplier')}</span>
                              <span class="font-mono-num text-white">${Number(c.price_multiplier).toFixed(2)}x</span>
                            </div>
                            <input type="range" min="0.6" max="1.8" step="0.05" value="${c.price_multiplier}" data-action="company-price" data-id="${c.id}"
                              class="w-full accent-sky-400 cursor-pointer" />
                            <div class="flex items-center justify-between pt-1">
                              <span class="text-xs text-slate-400">${t('labels.autoManaged')}</span>
                              <button data-action="company-automanage" data-id="${c.id}" data-next="${c.auto_managed ? '0' : '1'}"
                                class="px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${c.auto_managed ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">
                                ${c.auto_managed ? 'ON' : 'OFF'}
                              </button>
                            </div>
                          </div>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>
        </div>
      `;
    }

    case 'finances': {
      const availCredit = Math.max(0, fin.creditLimit - fin.debt);
      return `
        <div class="space-y-4">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${kpiCard(t('kpi.balance'), fmt(fin.cash), 'text-sky-400')}
            ${kpiCard(t('kpi.netWorth'), fmt(fin.netWorth), 'text-white')}
            ${kpiCard(t('kpi.revHr'), '+' + fmt(fin.revenuePerHour), 'text-emerald-400')}
            ${kpiCard(t('kpi.expHr'), '-' + fmt(fin.expensesPerHour), 'text-rose-400')}
            ${kpiCard(t('kpi.profitHr'), fmt(fin.netProfitPerHour), fin.netProfitPerHour >= 0 ? 'text-emerald-400' : 'text-rose-400')}
            ${kpiCard(lang === 'de' ? 'Operative Marge' : 'Operating Margin', `${fin.operatingMargin}%`, fin.operatingMargin >= 0 ? 'text-emerald-400' : 'text-rose-400')}
            ${kpiCard(lang === 'de' ? 'Verbindlichkeiten' : 'Corporate Debt', fmt(fin.debt), fin.debt > 0 ? 'text-amber-400' : 'text-slate-300')}
            ${kpiCard(lang === 'de' ? 'Lieferkette' : 'Supply Chain', `${fin.supplyChainEfficiency}%`, 'text-sky-400')}
          </div>

          ${renderDualLineChart(st.financialHistory, lang)}

          <div class="card-surface rounded-xl p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
            <div><div class="text-slate-400">${lang === 'de' ? 'Gebäudeunterhalt' : 'Maintenance'}</div><div class="font-mono-num text-rose-400 mt-1">-${fmt(fin.maintenancePerHour)}/h</div></div>
            <div><div class="text-slate-400">${lang === 'de' ? 'Lohnkosten' : 'Wages'}</div><div class="font-mono-num text-rose-400 mt-1">-${fmt(fin.wagesPerHour)}/h</div></div>
            <div><div class="text-slate-400">${lang === 'de' ? 'Energiekosten' : 'Energy Net'}</div><div class="font-mono-num text-rose-400 mt-1">-${fmt(fin.energyNetCost)}/h</div></div>
            <div><div class="text-slate-400">${lang === 'de' ? 'Transport' : 'Transport'}</div><div class="font-mono-num text-rose-400 mt-1">-${fmt(fin.transportPerHour)}/h</div></div>
            <div><div class="text-slate-400">${lang === 'de' ? 'Steuern' : 'Corp Taxes'}</div><div class="font-mono-num text-rose-400 mt-1">-${fmt(fin.taxesPerHour)}/h</div></div>
            <div><div class="text-slate-400">${lang === 'de' ? 'Kreditzinsen' : 'Debt Interest'}</div><div class="font-mono-num text-amber-400 mt-1">-${fmt(fin.interestPerHour)}/h</div></div>
          </div>

          <div class="card-surface rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="text-sm font-semibold text-white">${lang === 'de' ? 'Unternehmensfinanzierung & Kreditlinie' : 'Corporate Credit Line & Loans'}</div>
              <div class="text-xs text-slate-400 font-mono-num">
                ${lang === 'de' ? 'Kreditlimit' : 'Credit Limit'}: <span class="text-white">${fmt(fin.creditLimit)}</span> ·
                ${lang === 'de' ? 'Verfügbar' : 'Available'}: <span class="text-emerald-400">${fmt(availCredit)}</span> ·
                ${lang === 'de' ? 'Zinssatz' : 'Rate'}: <span class="text-amber-400">${fin.interestRate}% p.a.</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button data-action="take-loan" data-amt="50000" class="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">
                +${fmt(50000)} ${lang === 'de' ? 'Kredit' : 'Loan'}
              </button>
              <button data-action="take-loan" data-amt="150000" class="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold text-xs cursor-pointer">
                +${fmt(150000)} ${lang === 'de' ? 'Kredit' : 'Loan'}
              </button>
              <button data-action="repay-loan" data-amt="25000" class="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold text-xs cursor-pointer">
                -${fmt(25000)} ${lang === 'de' ? 'Tilgen' : 'Repay'}
              </button>
              <button data-action="repay-loan" data-amt="0" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer">
                ${lang === 'de' ? 'Alles tilgen' : 'Repay All'}
              </button>
            </div>
          </div>
        </div>
      `;
    }

    case 'employees': {
      return `
        <div class="space-y-5">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Bewerberpool' : 'Talent Market'}</h3>
            <button data-action="refresh-candidates" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs cursor-pointer">
              ${lang === 'de' ? 'Kandidaten aktualisieren' : 'Refresh Candidates'}
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            ${store.candidates
              .map((cand) => {
                const roleDef = cat.employeeRoles.find((r) => r.id === cand.role);
                return `
                  <div class="card-surface rounded-xl p-3.5 space-y-2.5">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold text-white">${cand.name}</span>
                      <span class="text-xs font-mono-num text-sky-400">Skill ${cand.skill}/10</span>
                    </div>
                    <div class="text-xs text-slate-400">${locName(roleDef)} · ${fmt(cand.salary)}/h</div>
                    <div class="flex gap-2">
                      <select id="hire-comp-${cand.candidateId}" class="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200">
                        <option value="">${lang === 'de' ? 'Holding (Allgemein)' : 'Holding Pool'}</option>
                        ${st.companies.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
                      </select>
                      <button data-action="hire-candidate" data-cand="${cand.candidateId}" class="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer">
                        ${t('actions.hire')} (${fmt(cand.hireFee)})
                      </button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>

          <div>
            <h3 class="text-sm font-semibold text-white mb-2.5">${lang === 'de' ? 'Aktive Belegschaft' : 'Active Workforce'} (${st.employees.length})</h3>
            <div class="space-y-2">
              ${
                st.employees.length === 0
                  ? `<div class="card-surface rounded-xl p-4 text-xs text-slate-400">${lang === 'de' ? 'Noch keine Mitarbeiter eingestellt.' : 'No staff hired yet.'}</div>`
                  : st.employees
                      .map((emp) => {
                        const roleDef = cat.employeeRoles.find((r) => r.id === emp.role);
                        const trainCost = 1800 * emp.skill;
                        return `
                          <div class="card-surface rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div class="text-xs font-semibold text-white">${emp.name} <span class="text-sky-400 font-normal">· ${locName(roleDef)}</span></div>
                              <div class="text-xs text-slate-400 font-mono-num mt-0.5">
                                ${t('labels.skill')} ${emp.skill}/10 · ${t('labels.productivity')} ${(emp.productivity * 100).toFixed(0)}% · ${t('labels.satisfaction')} ${Math.round(emp.satisfaction)}% · ${fmt(emp.salary)}/h
                              </div>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                              <button data-action="emp-salary" data-id="${emp.id}" data-sal="${emp.salary + 10}" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs cursor-pointer">+$10/h</button>
                              <button data-action="emp-train" data-id="${emp.id}" class="px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs cursor-pointer">${t('actions.train')} (${fmt(trainCost)})</button>
                              <button data-action="emp-fire" data-id="${emp.id}" class="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs cursor-pointer">${t('actions.fire')}</button>
                            </div>
                          </div>
                        `;
                      })
                      .join('')
              }
            </div>
          </div>
        </div>
      `;
    }

    case 'research': {
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          ${cat.technologies
            .map((tech) => {
              const done = techCompleted.has(tech.id);
              const active = techResearching.get(tech.id);
              const preOk = !tech.prereq || techCompleted.has(tech.prereq);
              const branchName = lang === 'en' ? tech.branchNameEn : tech.branchNameDe;
              return `
                <div class="card-surface rounded-xl p-4 flex flex-col justify-between gap-3">
                  <div class="space-y-1">
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-sky-400 font-medium">${branchName}</span>
                      <span class="font-mono-num text-slate-300">${fmt(tech.cost)}</span>
                    </div>
                    <div class="text-sm font-semibold text-white">${locName(tech)}</div>
                    <div class="text-xs text-slate-400">${locDesc(tech)}</div>
                  </div>
                  ${
                    done
                      ? `<div class="text-xs font-semibold text-emerald-400">${t('labels.completed')}</div>`
                      : active
                      ? `<div class="text-xs font-semibold text-amber-400">${t('labels.researching')}...</div>`
                      : preOk
                      ? `<button data-action="start-research" data-tech="${tech.id}" class="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">${t('actions.startResearch')}</button>`
                      : `<div class="text-xs text-slate-500">${t('labels.locked')}</div>`
                  }
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    }

    case 'market': {
      return `
        <div class="space-y-3">
          <div class="card-surface rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>${lang === 'de' ? 'Konjunkturzyklus' : 'Market Cycle'}: <strong class="text-sky-400">${t('cycle.' + st.world.economicCycle)}</strong></span>
            <span class="text-slate-300">${lang === 'de' ? st.world.marketHeadlineDe : st.world.marketHeadlineEn}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${cat.resources
              .map((r) => {
                const m = st.market.find((x) => x.resource_id === r.id) || { current_price: r.basePrice, supply: 1000, demand: 1000, trend: 0, history_json: '[]' };
                const hist = JSON.parse(m.history_json || '[]');
                const ownedQty = st.inventory[r.id] || 0;
                const up = m.trend >= 0;
                return `
                  <div class="card-surface rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div class="space-y-1 min-w-0">
                      <div class="text-sm font-semibold text-white truncate">${locName(r)}</div>
                      <div class="text-xs font-mono-num flex items-center gap-2">
                        <span class="text-white">${fmt(m.current_price)}/${r.unit}</span>
                        <span class="${up ? 'text-emerald-400' : 'text-rose-400'}">${up ? '+' : ''}${m.trend}%</span>
                      </div>
                      <div class="text-xs text-slate-400 font-mono-num">${t('labels.inventory')}: ${ownedQty} ${r.unit}</div>
                    </div>
                    ${renderSparkline(hist, up)}
                    <div class="flex flex-col gap-1.5 shrink-0">
                      <button data-action="market-trade" data-res="${r.id}" data-side="buy" data-qty="10" class="px-3 py-1 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">+10 ${t('actions.buy')}</button>
                      <button data-action="market-trade" data-res="${r.id}" data-side="sell" data-qty="10" class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer">-10 ${t('actions.sell')}</button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    case 'trade': {
      return `
        <div class="space-y-5">
          <div class="card-surface rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Echte Online-Spieler' : 'Live Connected Players'} (${store.onlinePlayers.length})</h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              ${store.onlinePlayers
                .map(
                  (op) => `
                  <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div class="font-semibold text-white">${op.empireName}</div>
                      <div class="text-slate-400">${op.name} ${op.playerId === st.player.id ? (lang === 'de' ? '(Du)' : '(You)') : ''}</div>
                    </div>
                    ${
                      op.playerId !== st.player.id
                        ? `<button data-action="visit-empire" data-pid="${op.playerId}" class="px-2.5 py-1 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold cursor-pointer">${t('actions.visit')}</button>`
                        : ''
                    }
                  </div>
                `
                )
                .join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="card-surface rounded-xl p-4 space-y-3">
              <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Handelsvertrag anbieten (P2P)' : 'Post P2P Trade Contract'}</h3>
              <form id="trade-offer-form" class="grid grid-cols-3 gap-2">
                <select id="offer-res" class="px-2.5 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white">
                  ${cat.resources.map((r) => `<option value="${r.id}">${locName(r)} (${st.inventory[r.id] || 0})</option>`).join('')}
                </select>
                <input id="offer-qty" type="number" min="1" value="10" class="px-2.5 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white" />
                <input id="offer-price" type="number" min="10" value="400" class="px-2.5 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white" />
                <button type="submit" class="col-span-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">
                  ${lang === 'de' ? 'Angebot am Handelsplatz einstellen' : 'List Contract on Exchange'}
                </button>
              </form>
              <div class="space-y-2 max-h-56 overflow-y-auto">
                ${
                  st.tradeOffers.length === 0
                    ? `<div class="text-xs text-slate-400">${lang === 'de' ? 'Keine offenen Spieler-Angebote.' : 'No open player trade offers.'}</div>`
                    : st.tradeOffers
                        .map((o) => {
                          const r = cat.resources.find((x) => x.id === o.resource_id);
                          const isMine = o.seller_id === st.player.id;
                          return `
                            <div class="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                              <div>
                                <div class="text-white font-medium">${o.quantity}x ${locName(r)} · ${fmt(o.unit_price)}/u</div>
                                <div class="text-slate-400">${o.seller_name}</div>
                              </div>
                              ${
                                isMine
                                  ? `<button data-action="cancel-offer" data-id="${o.id}" class="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 cursor-pointer">${t('actions.cancel')}</button>`
                                  : `<button data-action="accept-offer" data-id="${o.id}" class="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-semibold cursor-pointer">${t('actions.accept')} (${fmt(o.quantity * o.unit_price)})</button>`
                              }
                            </div>
                          `;
                        })
                        .join('')
                }
              </div>
            </div>

            <div class="card-surface rounded-xl p-4 space-y-3">
              <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Allianzen & Großprojekte' : 'Alliances & Megaprojects'}</h3>
              ${
                st.alliance
                  ? `
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 text-xs">
                  <div class="flex justify-between font-semibold text-white">
                    <span>[${st.alliance.tag}] ${st.alliance.name}</span>
                    <span class="text-sky-400">${st.alliance.project_name}</span>
                  </div>
                  <div class="w-full h-2 bg-slate-800 rounded overflow-hidden">
                    <div class="h-full bg-emerald-500" style="width:${Math.min(100, (st.alliance.project_progress / st.alliance.project_target) * 100)}%"></div>
                  </div>
                  <div class="flex justify-between text-slate-400 font-mono-num">
                    <span>${fmt(st.alliance.project_progress)} / ${fmt(st.alliance.project_target)}</span>
                    <button data-action="ally-contribute" data-amt="10000" class="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-semibold cursor-pointer">+${fmt(10000)} ${t('actions.contribute')}</button>
                  </div>
                </div>`
                  : `
                <form id="create-alliance-form" class="flex gap-2">
                  <input id="ally-name" type="text" placeholder="${lang === 'de' ? 'Allianzname' : 'Alliance Name'}" required class="flex-1 px-2.5 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white" />
                  <input id="ally-tag" type="text" placeholder="TAG" maxlength="4" required class="w-16 px-2.5 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white uppercase" />
                  <button type="submit" class="px-3 py-2 rounded bg-sky-500 text-slate-950 font-semibold text-xs cursor-pointer">${t('actions.create')} ($25k)</button>
                </form>
                <div class="space-y-2">
                  ${st.alliances
                    .map(
                      (a) => `
                    <div class="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                      <span>[${a.tag}] ${a.name} (${a.member_count})</span>
                      <button data-action="join-alliance" data-id="${a.id}" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer">${t('actions.join')}</button>
                    </div>`
                    )
                    .join('')}
                </div>`
              }
            </div>
          </div>
        </div>
      `;
    }

    case 'missions': {
      const claimed = new Set(st.claimedMissions);
      const metrics = {
        companiesCount: st.companies.length,
        buildingsCount: fin.buildingsCount,
        employeesCount: fin.employeesCount,
        researchCount: techCompleted.size,
        netWorth: fin.netWorth,
        tradesCount: st.player.trades_count || 0,
      };
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${cat.missions
            .map((m) => {
              const cur = Math.min(m.target, metrics[m.metric] || 0);
              const pct = Math.min(100, Math.round((cur / m.target) * 100));
              const isClaimed = claimed.has(m.id);
              const canClaim = !isClaimed && cur >= m.target;
              const title = lang === 'en' ? m.titleEn : m.titleDe;
              const desc = lang === 'en' ? m.descEn : m.descDe;
              return `
                <div class="card-surface rounded-xl p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-sky-400 uppercase font-medium">${m.type}</span>
                      <span class="font-mono-num text-emerald-400">+${fmt(m.rewardCash)} · +${m.rewardXp} XP</span>
                    </div>
                    <div class="text-sm font-semibold text-white mt-1">${title}</div>
                    <div class="text-xs text-slate-400 mt-0.5">${desc}</div>
                  </div>
                  <div class="space-y-2">
                    <div class="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
                      <div class="h-full bg-sky-400" style="width:${pct}%"></div>
                    </div>
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-mono-num text-slate-300">${cur.toLocaleString()} / ${m.target.toLocaleString()}</span>
                      ${
                        isClaimed
                          ? `<span class="text-emerald-400 font-medium">${t('labels.completed')}</span>`
                          : canClaim
                          ? `<button data-action="claim-mission" data-id="${m.id}" class="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer">${t('actions.claim')}</button>`
                          : `<span class="text-slate-500">${pct}%</span>`
                      }
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    }

    case 'stats': {
      return `
        <div class="space-y-4">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${kpiCard(t('kpi.level'), `${st.player.level} (${st.player.xp} XP)`, 'text-sky-400')}
            ${kpiCard(lang === 'de' ? 'Grundstücke' : 'Plots Owned', `${fin.plotsCount}/${cat.plots.length}`, 'text-white')}
            ${kpiCard(lang === 'de' ? 'Forschungen' : 'Tech Unlocked', `${techCompleted.size}/${cat.technologies.length}`, 'text-indigo-400')}
            ${kpiCard(lang === 'de' ? 'Handelsvolumen' : 'Trades Executed', String(st.player.trades_count || 0), 'text-emerald-400')}
          </div>
          <div class="card-surface rounded-xl p-4">
            <h3 class="text-sm font-semibold text-white mb-3">${t('labels.inventory')}</h3>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2.5">
              ${cat.resources
                .map(
                  (r) => `
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <div class="text-slate-400 truncate">${locName(r)}</div>
                  <div class="font-mono-num text-white font-semibold mt-1">${st.inventory[r.id] || 0} ${r.unit}</div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      `;
    }

    case 'leaderboard': {
      return `
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-xs text-slate-400">${lang === 'de' ? 'Echtzeit-Rangliste aller registrierten Imperien' : 'Live server rankings across all registered empires'}</span>
            <button data-action="refresh-leaderboard" class="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs cursor-pointer">${lang === 'de' ? 'Aktualisieren' : 'Refresh'}</button>
          </div>
          <div class="space-y-2">
            ${store.leaderboard
              .map(
                (row, i) => `
              <div class="card-surface rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div class="flex items-center gap-3">
                  <span class="font-mono-num font-bold text-sm ${i === 0 ? 'text-amber-400' : 'text-slate-400'}">#${i + 1}</span>
                  <div>
                    <div class="font-semibold text-white">${row.empireName} <span class="text-slate-400 font-normal">· ${row.name}</span></div>
                    <div class="text-slate-400 font-mono-num">Lv.${row.level} · ${row.buildingsCount} ${t('kpi.buildings')} · ${row.employeesCount} ${t('kpi.employees')}</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <div class="text-right">
                    <div class="font-mono-num font-semibold text-emerald-400">${fmt(row.netWorth)}</div>
                    <div class="font-mono-num text-slate-400">+${fmt(row.revenuePerHour)}/h</div>
                  </div>
                  ${
                    row.playerId !== st.player.id
                      ? `<button data-action="visit-empire" data-pid="${row.playerId}" class="px-2.5 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold cursor-pointer">${t('actions.visit')}</button>`
                      : `<span class="px-2.5 py-1 text-sky-400 font-semibold">${lang === 'de' ? 'Du' : 'You'}</span>`
                  }
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
    }

    case 'settings': {
      const s = st.player.settings || {};
      const ownedCos = new Set(st.cosmeticsOwned || []);
      return `
        <div class="space-y-5">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="card-surface rounded-xl p-4 space-y-3">
              <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Sprache & Profil' : 'Language & Profile'}</h3>
              <div class="flex gap-2">
                <button data-action="set-lang" data-lang="de" class="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer ${lang === 'de' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">Deutsch</button>
                <button data-action="set-lang" data-lang="en" class="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer ${lang === 'en' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'}">English</button>
              </div>
              <form id="rename-empire-form" class="flex gap-2 pt-2">
                <input id="rename-empire-input" type="text" value="${st.player.empire_name}" maxlength="40" class="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white" />
                <button type="submit" class="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium cursor-pointer">${t('actions.save')}</button>
              </form>
            </div>

            <div class="card-surface rounded-xl p-4 space-y-2.5 text-xs">
              <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Audio-Konfiguration' : 'Audio Configuration'}</h3>
              <label class="flex items-center justify-between gap-3"><span>Master</span><input type="range" min="0" max="1" step="0.05" value="${s.soundMaster ?? 0.65}" data-action="audio-vol" data-ch="master" class="w-40 accent-sky-400" /></label>
              <label class="flex items-center justify-between gap-3"><span>${lang === 'de' ? 'Hintergrundmusik' : 'Ambient Music'}</span><input type="range" min="0" max="1" step="0.05" value="${s.soundMusic ?? 0.38}" data-action="audio-vol" data-ch="music" class="w-40 accent-sky-400" /></label>
              <label class="flex items-center justify-between gap-3"><span>${lang === 'de' ? 'Stadtatmosphäre' : 'City Ambience'}</span><input type="range" min="0" max="1" step="0.05" value="${s.soundCity ?? 0.42}" data-action="audio-vol" data-ch="city" class="w-40 accent-sky-400" /></label>
              <label class="flex items-center justify-between gap-3"><span>UI & SFX</span><input type="range" min="0" max="1" step="0.05" value="${s.soundUi ?? 0.72}" data-action="audio-vol" data-ch="ui" class="w-40 accent-sky-400" /></label>
            </div>
          </div>

          <div class="card-surface rounded-xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Architektur-Skins & Kosmetik (Kein Pay-to-Win)' : 'Architectural Skins & Cosmetics (Fair Play)'}</h3>
                <p class="text-xs text-slate-400">${lang === 'de' ? 'Rein visuelle Designs für deine Gebäude — keinerlei Spielvorteile.' : 'Purely visual building finishes and trims — zero gameplay advantage.'}</p>
              </div>
              <span class="font-mono-num text-xs text-amber-400">${st.player.credits} Credits</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              ${cat.cosmetics
                .map((cos) => {
                  const isOwned = ownedCos.has(cos.id);
                  const isActive = st.player.active_skin === cos.id;
                  return `
                    <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between gap-2 text-xs">
                      <div>
                        <div class="flex items-center justify-between font-semibold text-white">
                          <span>${locName(cos)}</span>
                          <span class="w-3.5 h-3.5 rounded-sm inline-block border border-white/20" style="background:${cos.accentColor}"></span>
                        </div>
                        <div class="text-slate-400 mt-1">${locDesc(cos)}</div>
                      </div>
                      <button data-action="buy-cosmetic" data-id="${cos.id}" class="w-full py-1.5 rounded font-semibold cursor-pointer ${isActive ? 'bg-emerald-500 text-slate-950' : isOwned ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-amber-500 hover:bg-amber-400 text-slate-950'}">
                        ${isActive ? (lang === 'de' ? 'Aktiv' : 'Active') : isOwned ? (lang === 'de' ? 'Aktivieren' : 'Equip') : `${cos.priceCredits} Credits`}
                      </button>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
          <div class="card-surface rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-white">${lang === 'de' ? 'Neues Imperium starten' : 'Start Fresh Empire'}</h3>
              <p class="text-xs text-slate-400">${lang === 'de' ? 'Starte komplett neu ohne Gebäude oder Grundstücke mit $100.000 Startkapital.' : 'Restart from scratch with zero buildings or plots and $100,000 starting capital.'}</p>
            </div>
            <button data-action="start-new-empire" class="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold cursor-pointer">
              ${lang === 'de' ? 'Neu starten ($100.000)' : 'Restart ($100,000)'}
            </button>
          </div>
        </div>
      `;
    }

    default:
      return '';
  }
}

function kpiCard(label, value, colorClass) {
  return `
    <div class="card-surface rounded-xl p-3.5">
      <div class="text-xs text-slate-400 truncate">${label}</div>
      <div class="font-mono-num text-base md:text-lg font-semibold ${colorClass} mt-1 truncate">${value}</div>
    </div>
  `;
}
