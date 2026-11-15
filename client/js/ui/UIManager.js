import { store } from '../core/StateStore.js';
import { network } from '../core/NetworkClient.js';
import { soundEngine } from '../audio/SoundEngine.js';
import { t, locName, setLanguage, getLanguage } from '../../../localization/i18n.js';
import { renderTitleScreen } from './TitleScreen.js';
import { renderMenuContent } from './MenuViews.js';
import { getUpgradeDurationSec } from '../../../shared/gameData.ts';

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

const MENU_IDS = [
  'dashboard',
  'city',
  'plots',
  'construction',
  'companies',
  'finances',
  'employees',
  'research',
  'market',
  'trade',
  'missions',
  'stats',
  'leaderboard',
  'settings',
];

export class UIManager {
  constructor(rootEl, cityWorld) {
    this.rootEl = rootEl;
    this.cityWorld = cityWorld;
    this.rootEl.innerHTML = `
      <div id="hud-layer" class="fixed inset-0 z-20 pointer-events-none"></div>
      <div id="modal-layer" class="fixed inset-0 z-30 pointer-events-none"></div>
      <div id="toast-layer" class="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none"></div>
    `;
    this.hudLayer = this.rootEl.querySelector('#hud-layer');
    this.modalLayer = this.rootEl.querySelector('#modal-layer');
    this.toastLayer = this.rootEl.querySelector('#toast-layer');
    this._lastModalScrollInteract = 0;
    this._isPointerDownInModal = false;
    this._renderedMenuId = null;

    this._bindGlobalEvents();
    store.subscribe((_s, reason) => this.render(reason));
    this.render('init');
  }

  _getSavedMeta() {
    try {
      return JSON.parse(localStorage.getItem('digitalempire_profile') || 'null');
    } catch {
      return null;
    }
  }

  _saveMeta(meta) {
    localStorage.setItem('digitalempire_profile', JSON.stringify(meta));
  }

  _bindGlobalEvents() {
    const markScrollInteract = () => {
      this._lastModalScrollInteract = performance.now();
    };
    this.modalLayer.addEventListener('scroll', markScrollInteract, { capture: true, passive: true });
    this.modalLayer.addEventListener('wheel', markScrollInteract, { capture: true, passive: true });
    this.modalLayer.addEventListener('touchstart', markScrollInteract, { capture: true, passive: true });
    this.modalLayer.addEventListener('touchmove', markScrollInteract, { capture: true, passive: true });
    this.modalLayer.addEventListener('pointerdown', () => {
      this._isPointerDownInModal = true;
      markScrollInteract();
    }, { capture: true, passive: true });
    window.addEventListener('pointerup', () => {
      if (this._isPointerDownInModal) {
        this._isPointerDownInModal = false;
        markScrollInteract();
      }
    }, { passive: true });
    window.addEventListener('pointercancel', () => {
      this._isPointerDownInModal = false;
    }, { passive: true });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }
      if (store.phase === 'title' && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        const form = document.getElementById('launch-form');
        if (form) form.requestSubmit();
        return;
      }
      if (store.phase !== 'playing') return;

      if (e.code === 'KeyH') {
        store.toggleHud();
      } else if (e.code === 'KeyR') {
        soundEngine.playClick();
        store.rotatePreview();
      } else if (e.key === 'Escape') {
        if (store.activeMenu) store.closeMenu();
        else if (store.selectedPlotId) store.selectPlot(null);
      }
    });

    // Event delegation on rootEl
    this.rootEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;

      if (form.id === 'launch-form') {
        soundEngine.init();
        soundEngine.playConstruct();
        const name = document.getElementById('input-ceo-name')?.value?.trim() || 'CEO';
        const empireName = document.getElementById('input-empire-name')?.value?.trim() || 'Horizon Holdings';
        const saved = this._getSavedMeta();
        try {
          const res = await store.api('/session', {
            playerId: saved?.playerId,
            name,
            empireName,
            language: getLanguage(),
          });
          this._saveMeta({ playerId: res.playerId, name, empireName });
          store.offlineReport = res.offlineReport || null;
          store.setState(res.state, 'session');
          if (res.state?.player?.language) setLanguage(res.state.player.language);
          store.setPhase('playing');
          network.connect(res.playerId, name, empireName);
          this._loadSecondaryLists();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (form.id === 'found-company-form') {
        const name = document.getElementById('company-name-input')?.value?.trim();
        const industryId = document.getElementById('company-industry-select')?.value;
        try {
          await store.api('/companies/found', { playerId: store.state.player.id, name, industryId });
          soundEngine.playCash();
          store.notify(getLanguage() === 'de' ? 'Unternehmen gegründet!' : 'Company founded!', 'success');
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (form.id === 'trade-offer-form') {
        const resourceId = document.getElementById('offer-res')?.value;
        const quantity = Number(document.getElementById('offer-qty')?.value);
        const unitPrice = Number(document.getElementById('offer-price')?.value);
        try {
          await store.api('/trade/offer', { playerId: store.state.player.id, resourceId, quantity, unitPrice });
          soundEngine.playCash();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (form.id === 'create-alliance-form') {
        const name = document.getElementById('ally-name')?.value?.trim();
        const tag = document.getElementById('ally-tag')?.value?.trim();
        try {
          await store.api('/alliances/create', { playerId: store.state.player.id, name, tag });
          soundEngine.playConstruct();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (form.id === 'rename-empire-form') {
        const empireName = document.getElementById('rename-empire-input')?.value?.trim();
        try {
          await store.api('/settings/update', { playerId: store.state.player.id, empireName });
          soundEngine.playClick();
          store.notify(t('actions.save'), 'success');
        } catch (err) {
          store.notify(err.message, 'error');
        }
      }
    });

    this.rootEl.addEventListener('change', async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;

      if (action === 'company-price' && store.state) {
        try {
          await store.api('/companies/update', {
            playerId: store.state.player.id,
            companyId: el.dataset.id,
            priceMultiplier: Number(el.value),
          });
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'audio-vol') {
        const ch = el.dataset.ch;
        const val = Number(el.value);
        soundEngine.applySettings({ [ch]: val }, soundEngine.muted);
        if (store.state) {
          const next = {
            ...(store.state.player.settings || {}),
            [`sound${ch.charAt(0).toUpperCase() + ch.slice(1)}`]: val,
          };
          store.api('/settings/update', { playerId: store.state.player.id, settings: next }).catch(() => {});
        }
      }
    });

    this.rootEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const pid = store.state?.player?.id;

      if (action === 'set-lang') {
        soundEngine.playClick();
        const lang = btn.dataset.lang;
        setLanguage(lang);
        if (pid) store.api('/settings/update', { playerId: pid, language: lang }).catch(() => {});
        this.render('lang');
      } else if (action === 'toggle-mute') {
        soundEngine.toggleMute();
        this.render('audio');
      } else if (action === 'toggle-hud') {
        soundEngine.playClick();
        store.toggleHud();
      } else if (action === 'open-menu') {
        soundEngine.playClick();
        const m = btn.dataset.menu;
        if (m === 'leaderboard') this._refreshLeaderboard();
        if (m === 'employees' && store.candidates.length === 0) this._refreshCandidates();
        store.openMenu(m);
      } else if (action === 'close-menu') {
        soundEngine.playClick();
        store.closeMenu();
      } else if (action === 'cam-preset') {
        soundEngine.playClick();
        this.cityWorld.setCameraPreset(btn.dataset.preset);
      } else if (action === 'focus-plot') {
        soundEngine.playClick();
        store.selectPlot(btn.dataset.plot);
        this.cityWorld.setCameraPreset('plot', btn.dataset.plot);
      } else if (action === 'select-plot-build') {
        soundEngine.playClick();
        store.selectPlot(btn.dataset.plot);
        store.openMenu('construction');
      } else if (action === 'rotate-preview') {
        soundEngine.playClick();
        store.rotatePreview();
      } else if (action === 'cycle-weather') {
        soundEngine.playClick();
        const list = [null, 'clear', 'overcast', 'rain', 'fog'];
        const nextIdx = (list.indexOf(store.localWeatherOverride) + 1) % list.length;
        store.localWeatherOverride = list[nextIdx];
        this.render('weather');
      } else if (action === 'cycle-time') {
        soundEngine.playClick();
        const list = [null, 9, 17, 22];
        const nextIdx = (list.indexOf(store.localTimeOverride) + 1) % list.length;
        store.localTimeOverride = list[nextIdx];
        this.render('time');
      } else if (action === 'dismiss-offline') {
        store.offlineReport = null;
        this.render('offline');
      } else if (action === 'close-plot-card') {
        store.selectPlot(null);
      } else if (action === 'return-home') {
        soundEngine.playClick();
        store.setVisiting(null);
        this.cityWorld.syncFromStore(true);
      } else if (action === 'start-new-empire') {
        soundEngine.init();
        soundEngine.playConstruct();
        localStorage.removeItem('digitalempire_profile');
        const name = document.getElementById('input-ceo-name')?.value?.trim() || store.state?.player?.name || 'CEO';
        const empireName = document.getElementById('input-empire-name')?.value?.trim() || 'Horizon Holdings';
        try {
          const res = await store.api('/session', { name, empireName, language: getLanguage() });
          this._saveMeta({ playerId: res.playerId, name, empireName });
          store.offlineReport = null;
          store.selectPlot(null);
          store.closeMenu();
          store.setState(res.state, 'session');
          store.setPhase('playing');
          network.connect(res.playerId, name, empireName);
          this._loadSecondaryLists();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (!pid) {
        return;
      } else if (action === 'buy-plot') {
        try {
          await store.api('/plots/buy', { playerId: pid, plotId: btn.dataset.plot });
          soundEngine.playCash();
          store.notify(getLanguage() === 'de' ? 'Grundstück gekauft!' : 'Plot purchased!', 'success');
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'construct-building') {
        if (!store.selectedPlotId) return;
        try {
          await store.api('/buildings/construct', {
            playerId: pid,
            plotId: store.selectedPlotId,
            buildingType: btn.dataset.type,
            rotation: store.buildRotation,
          });
          soundEngine.playConstruct();
          store.notify(getLanguage() === 'de' ? 'Bau gestartet!' : 'Construction started!', 'success');
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'upgrade-building') {
        try {
          await store.api('/buildings/upgrade', { playerId: pid, buildingId: btn.dataset.id });
          soundEngine.playConstruct();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'rotate-building') {
        try {
          await store.api('/buildings/customize', { playerId: pid, buildingId: btn.dataset.id, rotation: Number(btn.dataset.rot) });
          soundEngine.playClick();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'demolish-building') {
        try {
          await store.api('/buildings/demolish', { playerId: pid, buildingId: btn.dataset.id });
          soundEngine.playClick();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'company-automanage') {
        try {
          await store.api('/companies/update', {
            playerId: pid,
            companyId: btn.dataset.id,
            autoManaged: btn.dataset.next === '1',
          });
          soundEngine.playClick();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'refresh-candidates') {
        soundEngine.playClick();
        await this._refreshCandidates();
      } else if (action === 'hire-candidate') {
        const cand = store.candidates.find((c) => c.candidateId === btn.dataset.cand);
        if (!cand) return;
        const companyId = document.getElementById(`hire-comp-${cand.candidateId}`)?.value || '';
        try {
          await store.api('/employees/hire', { playerId: pid, companyId: companyId || null, ...cand });
          soundEngine.playCash();
          store.candidates = store.candidates.filter((c) => c.candidateId !== cand.candidateId);
          this.render('candidates');
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'emp-train') {
        try {
          await store.api('/employees/manage', { playerId: pid, employeeId: btn.dataset.id, action: 'train' });
          soundEngine.playCash();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'emp-salary') {
        try {
          await store.api('/employees/manage', { playerId: pid, employeeId: btn.dataset.id, action: 'update', salary: Number(btn.dataset.sal) });
          soundEngine.playClick();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'emp-fire') {
        try {
          await store.api('/employees/manage', { playerId: pid, employeeId: btn.dataset.id, action: 'fire' });
          soundEngine.playClick();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'start-research') {
        try {
          await store.api('/research/start', { playerId: pid, techId: btn.dataset.tech });
          soundEngine.playConstruct();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'market-trade') {
        try {
          await store.api('/market/trade', {
            playerId: pid,
            resourceId: btn.dataset.res,
            action: btn.dataset.side,
            quantity: Number(btn.dataset.qty),
          });
          soundEngine.playCash();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'accept-offer') {
        try {
          await store.api('/trade/accept', { playerId: pid, offerId: btn.dataset.id });
          soundEngine.playCash();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'cancel-offer') {
        try {
          await store.api('/trade/cancel', { playerId: pid, offerId: btn.dataset.id });
          soundEngine.playClick();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'join-alliance') {
        try {
          await store.api('/alliances/join', { playerId: pid, allianceId: btn.dataset.id });
          soundEngine.playConstruct();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'ally-contribute') {
        try {
          await store.api('/alliances/contribute', { playerId: pid, amount: Number(btn.dataset.amt) });
          soundEngine.playCash();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'claim-mission') {
        try {
          await store.api('/missions/claim', { playerId: pid, missionId: btn.dataset.id });
          soundEngine.playCash();
          store.notify(getLanguage() === 'de' ? 'Belohnung erhalten!' : 'Reward claimed!', 'success');
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'refresh-leaderboard') {
        soundEngine.playClick();
        await this._refreshLeaderboard();
      } else if (action === 'visit-empire') {
        try {
          const data = await store.api(`/visit/${btn.dataset.pid}`);
          soundEngine.playClick();
          store.closeMenu();
          store.setVisiting(data);
          this.cityWorld.syncFromStore(true);
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'buy-cosmetic') {
        try {
          await store.api('/cosmetics/buy', { playerId: pid, cosmeticId: btn.dataset.id });
          soundEngine.playCash();
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'take-loan') {
        try {
          await store.api('/loans/take', { playerId: pid, amount: Number(btn.dataset.amt) });
          soundEngine.playCash();
          store.notify(getLanguage() === 'de' ? 'Kredit ausgezahlt!' : 'Corporate loan disbursed!', 'success');
        } catch (err) {
          store.notify(err.message, 'error');
        }
      } else if (action === 'repay-loan') {
        try {
          await store.api('/loans/repay', { playerId: pid, amount: Number(btn.dataset.amt) });
          soundEngine.playCash();
          store.notify(getLanguage() === 'de' ? 'Kredit getilgt!' : 'Loan repaid!', 'success');
        } catch (err) {
          store.notify(err.message, 'error');
        }
      }
    });
  }

  async _loadSecondaryLists() {
    await Promise.allSettled([this._refreshCandidates(), this._refreshLeaderboard()]);
  }

  async _refreshCandidates() {
    try {
      const data = await store.api('/employees/candidates');
      store.setCandidates(data.candidates || []);
    } catch {
      // Ignore
    }
  }

  async _refreshLeaderboard() {
    try {
      const data = await store.api('/leaderboard');
      store.setLeaderboard(data.rankings || []);
    } catch {
      // Ignore
    }
  }

  render(reason) {
    this.cityWorld.syncFromStore(reason === 'selection' || reason === 'visiting' || reason === 'api');

    // Render toasts independently
    this.toastLayer.innerHTML = store.toasts
      .map(
        (toast) => `
      <div class="hud-surface px-3.5 py-2 rounded-lg text-xs font-medium shadow-lg pointer-events-auto ${
        toast.kind === 'error' ? 'border-rose-500/60 text-rose-300' : 'border-emerald-500/50 text-emerald-300'
      }">${toast.message}</div>`
      )
      .join('');
    if (reason === 'toast') return;

    if (store.phase === 'title') {
      this.hudLayer.innerHTML = '';
      this.modalLayer.innerHTML = renderTitleScreen(this._getSavedMeta());
      this._renderedMenuId = null;
      return;
    }

    const st = store.state;
    const cat = store.catalog;
    if (!st || !cat) return;

    // Preserve active input focus, scrollTop, and horizontal scrollLeft on background ticks
    const activeEl = document.activeElement;
    const isTypingInDrawer = activeEl && this.modalLayer.contains(activeEl) && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');
    const isActivelyScrollingDrawer = this._isPointerDownInModal || (performance.now() - this._lastModalScrollInteract < 850);
    const prevKpiScroll = this.hudLayer.querySelector('#hud-kpi-scroll');
    const prevKpiScrollLeft = prevKpiScroll ? prevKpiScroll.scrollLeft : 0;

    const fin = st.financials;
    const hour = (store.localTimeOverride !== null ? store.localTimeOverride : st.world.gameHour) % 24;
    const weather = store.localWeatherOverride || st.world.weather;

    // 1. Top Perimeter Status Bar + Selected Plot Card + Collapsible Bottom Dock
    this.hudLayer.innerHTML = `
      <!-- Top Slim Perimeter Bar -->
      <header class="fixed top-3 left-3 right-3 h-12 hud-surface rounded-xl px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 pointer-events-auto">
        <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <div class="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.85)]"></div>
          <span class="font-display font-bold text-sm tracking-wide text-white whitespace-nowrap hidden sm:inline">DIGITALEMPIRE</span>
          <span class="font-display font-bold text-sm tracking-wide text-white whitespace-nowrap sm:hidden">DE</span>
          <span class="hidden sm:inline text-xs text-slate-600">·</span>
          <span class="hidden md:inline text-xs font-medium text-sky-300/90 truncate max-w-[140px]">${st.player.empire_name}</span>
        </div>

        <div id="hud-kpi-scroll" class="flex items-center gap-3 md:gap-5 overflow-x-auto text-xs whitespace-nowrap min-w-0">
          <div>
            <span class="hidden sm:inline text-slate-400 mr-1">${t('kpi.balance')}:</span>
            <strong class="font-mono-num text-sky-400">${fmt(fin.cash)}</strong>
          </div>
          <span class="hidden md:inline text-slate-700/80">|</span>
          <div class="hidden md:block">
            <span class="text-slate-400 mr-1">${t('kpi.netWorth')}:</span>
            <strong class="font-mono-num text-white">${fmt(fin.netWorth)}</strong>
          </div>
          <span class="hidden sm:inline text-slate-700/80">|</span>
          <div>
            <span class="hidden sm:inline text-slate-400 mr-1">${t('kpi.profitHr')}:</span>
            <strong class="font-mono-num ${fin.netProfitPerHour >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fin.netProfitPerHour >= 0 ? '+' : ''}${fmt(fin.netProfitPerHour)}</strong>
          </div>
          <span class="hidden lg:inline text-slate-700/80">|</span>
          <div class="hidden lg:block">
            <span class="text-slate-400 mr-1">${t('kpi.level')}:</span>
            <strong class="font-mono-num text-amber-400">${st.player.level}</strong>
          </div>
          <span class="hidden xl:inline text-slate-700/80">|</span>
          <div class="hidden xl:block font-mono-num text-slate-300">
            ${String(hour).padStart(2, '0')}:00 · ${t('weather.' + weather)} · ${store.onlinePlayers.length} ${t('kpi.online')}
          </div>
        </div>

        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button data-action="toggle-mute" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-white/10 text-xs text-slate-200 cursor-pointer">
            <span class="hidden sm:inline">${soundEngine.muted ? 'Audio Off' : 'Audio On'}</span>
            <span class="sm:hidden">${soundEngine.muted ? 'Muted' : 'Audio'}</span>
          </button>
          <button data-action="open-menu" data-menu="dashboard" class="hud-btn btn-primary-exec px-3.5 py-1.5 rounded-lg text-slate-950 font-semibold text-xs cursor-pointer whitespace-nowrap">
            ${t('dock.menu')} (14)
          </button>
        </div>
      </header>

      ${
        store.visitingEmpire
          ? `
        <div class="fixed top-18 left-1/2 -translate-x-1/2 hud-surface border-amber-500/50 rounded-xl px-4 py-2 flex items-center gap-3 text-xs pointer-events-auto">
          <span class="text-amber-300 font-medium">${t('labels.visitingMode')}: <strong>${store.visitingEmpire.player.empire_name}</strong></span>
          <button data-action="return-home" class="hud-btn px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold cursor-pointer">${t('actions.returnHome')}</button>
        </div>`
          : ''
      }

      ${this._renderSelectedPlotBar()}

      <!-- Collapsible Bottom Control Dock -->
      <div class="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-[95vw] flex flex-col items-center pointer-events-none dock-transition ${
        store.hudCollapsed ? 'translate-y-[calc(100%-22px)]' : 'translate-y-0'
      }">
        <button data-action="toggle-hud" class="hud-btn pointer-events-auto px-4 py-1 rounded-t-lg hud-surface border-b-0 text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer">
          ${store.hudCollapsed ? `▴ ${t('dock.showHud')} (H)` : `▾ ${t('dock.hideHud')} (H)`}
        </button>
        <div class="pointer-events-auto hud-surface rounded-xl px-3 py-2 flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <button data-action="cam-preset" data-preset="overview" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('dock.overview')}</button>
          <button data-action="cam-preset" data-preset="downtown" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('dock.downtown')}</button>
          <button data-action="cam-preset" data-preset="harbor" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('dock.harbor')}</button>
          <button data-action="cam-preset" data-preset="airport" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('dock.airport')}</button>
          <span class="text-slate-700 px-0.5">|</span>
          <button data-action="cycle-weather" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('dock.weather')}: ${t('weather.' + weather)}</button>
          <button data-action="cycle-time" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('dock.time')}: ${String(hour).padStart(2, '0')}:00</button>
          <button data-action="rotate-preview" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-sky-300 cursor-pointer">${t('dock.rotate')}</button>
          <span class="text-slate-700 px-0.5">|</span>
          <button data-action="open-menu" data-menu="construction" class="hud-btn px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/25 text-sky-300 font-medium cursor-pointer">${t('nav.construction')}</button>
          <button data-action="open-menu" data-menu="companies" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('nav.companies')}</button>
          <button data-action="open-menu" data-menu="finances" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('nav.finances')}</button>
          <button data-action="open-menu" data-menu="trade" class="hud-btn px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-white/5 text-slate-200 cursor-pointer">${t('nav.trade')}</button>
        </div>
      </div>
    `;
    const nextKpiScroll = this.hudLayer.querySelector('#hud-kpi-scroll');
    if (nextKpiScroll && prevKpiScrollLeft > 0) nextKpiScroll.scrollLeft = prevKpiScrollLeft;

    // 2. Modals: Offline Report OR Active 14-Menu Command Center
    if (store.offlineReport) {
      this._renderedMenuId = null;
      const r = store.offlineReport;
      this.modalLayer.innerHTML = `
        <div class="fixed inset-0 bg-black/55 flex items-center justify-center p-4 pointer-events-auto">
          <div class="hud-surface rounded-2xl max-w-md w-full p-6 space-y-4">
            <h2 class="font-display text-xl font-bold text-white">${t('labels.offlineWelcome')}</h2>
            <p class="text-xs text-slate-300">${t('labels.offlineDesc')}</p>
            <div class="card-surface rounded-xl p-4 space-y-2 text-xs font-mono-num">
              <div class="flex justify-between"><span class="text-slate-400">Offline Duration</span><span class="text-white">${r.elapsedMinutes} min</span></div>
              <div class="flex justify-between"><span class="text-slate-400">Net Profit Earned</span><span class="text-emerald-400">+${fmt(r.cashEarned)}</span></div>
              <div class="flex justify-between"><span class="text-slate-400">Experience Gained</span><span class="text-sky-400">+${r.xpEarned} XP</span></div>
            </div>
            <button data-action="dismiss-offline" class="w-full py-2.5 rounded-lg btn-primary-exec text-slate-950 font-semibold text-xs cursor-pointer">
              ${t('actions.close')}
            </button>
          </div>
        </div>
      `;
      return;
    }

    if (!store.activeMenu) {
      this._renderedMenuId = null;
      this.modalLayer.innerHTML = '';
      return;
    }

    // Keep persistent modal drawer shell & horizontal tab bar DOM intact across ticks & tab switches
    let drawerEl = this.modalLayer.querySelector('#menu-drawer-shell');
    if (!drawerEl || reason === 'lang') {
      const prevTabsScroll = this.modalLayer.querySelector('#menu-tabs')?.scrollLeft || 0;
      this.modalLayer.innerHTML = `
        <div id="menu-drawer-shell" class="fixed inset-0 bg-black/45 flex items-center justify-center p-3 md:p-6 pointer-events-auto">
          <div class="hud-surface rounded-2xl w-full max-w-5xl max-h-[86vh] flex flex-col overflow-hidden shadow-2xl">
            <div class="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
              <div id="menu-drawer-title" class="font-display text-base font-bold text-white">${t('nav.' + store.activeMenu)}</div>
              <button data-action="close-menu" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer">
                ${t('actions.close')} (Esc)
              </button>
            </div>
            <div id="menu-tabs" class="px-4 py-2.5 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
              ${MENU_IDS.map(
                (id) => `
                <button data-action="open-menu" data-menu="${id}"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    store.activeMenu === id ? 'bg-sky-500 text-slate-950 font-semibold' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }">${t('nav.' + id)}</button>`
              ).join('')}
            </div>
            <div id="drawer-scroll" class="p-5 overflow-y-auto flex-1"></div>
          </div>
        </div>
      `;
      drawerEl = this.modalLayer.querySelector('#menu-drawer-shell');
      const tabsEl = drawerEl.querySelector('#menu-tabs');
      if (tabsEl && prevTabsScroll > 0) tabsEl.scrollLeft = prevTabsScroll;
      this._renderedMenuId = null;
    }

    // Update active tab styling in-place WITHOUT wiping #menu-tabs DOM or resetting scrollLeft
    const menuSwitched = this._renderedMenuId !== store.activeMenu;
    if (menuSwitched) {
      const titleEl = drawerEl.querySelector('#menu-drawer-title');
      if (titleEl) titleEl.textContent = t('nav.' + store.activeMenu);
      const tabBtns = drawerEl.querySelectorAll('#menu-tabs button[data-menu]');
      tabBtns.forEach((btn) => {
        const isActive = btn.dataset.menu === store.activeMenu;
        btn.className = `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
          isActive ? 'bg-sky-500 text-slate-950 font-semibold' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
        }`;
      });
    }

    // Defer background tick content re-renders while typing or actively scrolling inside menu
    if (reason === 'tick' && (isTypingInDrawer || isActivelyScrollingDrawer)) {
      return;
    }

    const scrollEl = drawerEl.querySelector('#drawer-scroll');
    if (scrollEl) {
      const prevTop = menuSwitched ? 0 : scrollEl.scrollTop;
      const innerHScrolls = menuSwitched
        ? []
        : Array.from(scrollEl.querySelectorAll('.overflow-x-auto')).map((el) => el.scrollLeft);

      scrollEl.innerHTML = renderMenuContent(store.activeMenu);
      scrollEl.scrollTop = prevTop;

      if (!menuSwitched && innerHScrolls.length > 0) {
        const nextInner = scrollEl.querySelectorAll('.overflow-x-auto');
        nextInner.forEach((el, idx) => {
          if (innerHScrolls[idx] > 0) el.scrollLeft = innerHScrolls[idx];
        });
      }
      this._renderedMenuId = store.activeMenu;
    }
  }

  _renderSelectedPlotBar() {
    if (!store.selectedPlotId || store.visitingEmpire || store.activeMenu) return '';
    const st = store.state;
    const cat = store.catalog;
    const bp = cat.plots.find((p) => p.id === store.selectedPlotId);
    if (!bp) return '';

    const owned = st.ownedPlots.includes(bp.id);
    const bld = st.buildings.find((b) => b.plot_id === bp.id);
    const bDef = bld ? cat.buildings.find((x) => x.id === bld.building_type) : null;
    const district = cat.districts[bp.district];

    let buildHtml = '';
    if (bld) {
      const now = Date.now();
      const totalMs = Math.max(1000, (bld.build_completes_at || now) - (bld.build_started_at || now - 1000));
      const pct = bld.is_constructing ? Math.max(4, Math.min(99, Math.round(((now - (bld.build_started_at || now)) / totalMs) * 100))) : 100;
      const remSec = bld.is_constructing ? Math.max(1, Math.ceil((bld.build_completes_at - now) / 1000)) : 0;
      buildHtml = bld.is_constructing
        ? `
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs font-mono-num text-amber-300">
              <span>${t('labels.constructing')}... (${remSec}s)</span>
              <span>${pct}%</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div class="h-full bg-amber-400 rounded-full transition-all duration-300" style="width:${pct}%"></div>
            </div>
          </div>`
        : `
          <div class="text-xs font-mono-num text-emerald-400">
            ${t('labels.operational')} · +${fmt(bDef.baseRevenuePerHour * (1 + (bld.level - 1) * 0.45))}/h
          </div>`;
    }

    return `
      <div class="fixed top-18 left-3 w-80 max-w-[92vw] hud-surface rounded-xl p-4 space-y-3 pointer-events-auto">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-[11px] font-mono-num uppercase tracking-wider text-sky-400">${bp.code} · ${locName(district)}</div>
            <div class="text-sm font-semibold text-white mt-0.5">
              ${bDef ? `${locName(bDef)} (${t('labels.level')} ${bld.level})` : owned ? (getLanguage() === 'de' ? 'Freies Grundstück' : 'Empty Owned Plot') : (getLanguage() === 'de' ? 'Verfügbares Grundstück' : 'Available Plot')}
            </div>
          </div>
          <button data-action="close-plot-card" class="hud-btn w-6 h-6 rounded-md bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 hover:text-white cursor-pointer flex items-center justify-center">✕</button>
        </div>

        ${
          !owned
            ? `
          <div class="text-xs text-slate-300">${locName(district)}: ${getLanguage() === 'de' ? district.bonusDe : district.bonusEn}</div>
          <button data-action="buy-plot" data-plot="${bp.id}" class="hud-btn btn-primary-exec w-full py-2 rounded-lg text-slate-950 font-semibold text-xs cursor-pointer">
            ${t('actions.buyPlot')} (${fmt(bp.basePrice)})
          </button>`
            : !bld
            ? `
          <div class="grid grid-cols-2 gap-1.5">
            <button data-action="construct-building" data-type="startup_office" class="hud-btn px-2.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">
              + ${locName(cat.buildings[0])}
            </button>
            <button data-action="construct-building" data-type="workshop_factory" class="hud-btn px-2.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer">
              + ${locName(cat.buildings[1])}
            </button>
          </div>
          <button data-action="open-menu" data-menu="construction" class="hud-btn w-full py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-xs text-slate-200 cursor-pointer">
            ${getLanguage() === 'de' ? 'Alle 12 Gebäudetypen öffnen...' : 'Open all 12 building blueprints...'}
          </button>`
            : `
          ${buildHtml}
          <div class="flex gap-2">
            ${
              bld.level < bDef.maxLevel && bld.is_constructing === 0
                ? `<button data-action="upgrade-building" data-id="${bld.id}" class="hud-btn flex-1 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer">${t('actions.upgrade')} (${fmt(Math.round(bDef.cost * 0.72 * bld.level))} · ${getUpgradeDurationSec(bDef.buildTimeSec, bld.level)}s)</button>`
                : ''
            }
            <button data-action="rotate-building" data-id="${bld.id}" data-rot="${(bld.rotation + 1) % 4}" class="hud-btn px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-xs cursor-pointer">90°</button>
            <button data-action="demolish-building" data-id="${bld.id}" class="hud-btn px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs cursor-pointer">✕</button>
          </div>`
        }
      </div>
    `;
  }
}
