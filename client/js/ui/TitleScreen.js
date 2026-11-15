import { t, getLanguage } from '../../../localization/i18n.js';

export function renderTitleScreen(savedMeta) {
  const lang = getLanguage();
  const hasSaved = Boolean(savedMeta?.playerId);
  const defaultName = savedMeta?.name || 'Alexander Vance';
  const defaultEmpire = savedMeta?.empireName || 'Vance Global Holdings';

  return `
    <div id="title-overlay" class="fixed inset-0 z-40 flex items-center justify-start p-5 md:p-14 pointer-events-none"
      style="background: linear-gradient(95deg, rgba(4, 8, 17, 0.80) 0%, rgba(4, 8, 17, 0.42) 38%, rgba(4, 8, 17, 0) 68%);">
      <div class="max-w-md w-full hud-surface rounded-2xl p-7 md:p-8 pointer-events-auto relative overflow-hidden">
        <div class="absolute inset-x-0 top-0 h-[2px]" style="background: linear-gradient(90deg, rgba(56, 189, 248, 0) 0%, rgba(56, 189, 248, 0.78) 50%, rgba(251, 191, 36, 0.45) 100%);"></div>

        <div class="flex items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-800/80">
          <div class="flex items-center gap-3.5">
            <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400/20 via-sky-500/10 to-amber-400/10 border border-sky-400/35 flex items-center justify-center shrink-0 shadow-inner">
              <svg width="26" height="26" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                <rect x="3" y="15" width="7" height="18" rx="1.5" fill="#0284c7" />
                <rect x="13" y="4" width="10" height="29" rx="1.5" fill="#38bdf8" />
                <rect x="26" y="10" width="7" height="23" rx="1.5" fill="#bae6fd" />
                <rect x="16" y="8.5" width="4" height="3.5" rx="0.5" fill="#070b13" />
                <rect x="16" y="15" width="4" height="3.5" rx="0.5" fill="#070b13" />
                <rect x="16" y="21.5" width="4" height="3.5" rx="0.5" fill="#070b13" />
              </svg>
            </div>
            <div>
              <div class="text-[10px] font-mono-num uppercase tracking-[0.2em] text-sky-400/90 mb-0.5">Metropolis Tycoon 3D</div>
              <h1 class="font-display text-2xl md:text-[28px] leading-none font-bold tracking-tight text-white">DIGITALEMPIRE</h1>
              <p class="text-xs text-slate-400 mt-1">${t('appSubtitle')}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 bg-slate-950/85 p-1 rounded-lg border border-slate-800/90">
            <button type="button" data-action="set-lang" data-lang="de" class="hud-btn px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${lang === 'de' ? 'bg-sky-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'}">DE</button>
            <button type="button" data-action="set-lang" data-lang="en" class="hud-btn px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${lang === 'en' ? 'bg-sky-500 text-slate-950 font-semibold' : 'text-slate-300 hover:text-white'}">EN</button>
          </div>
        </div>

        <form id="launch-form" class="space-y-4">
          <div>
            <label for="input-ceo-name" class="block text-xs font-medium text-slate-300 mb-1.5">${t('ceoNameLabel')}</label>
            <input id="input-ceo-name" type="text" value="${defaultName}" maxlength="32" required
              class="exec-input w-full px-3.5 py-2.5 rounded-lg text-sm text-white focus:outline-none" />
          </div>
          <div>
            <label for="input-empire-name" class="block text-xs font-medium text-slate-300 mb-1.5">${t('empireNameLabel')}</label>
            <input id="input-empire-name" type="text" value="${defaultEmpire}" maxlength="40" required
              class="exec-input w-full px-3.5 py-2.5 rounded-lg text-sm text-white focus:outline-none" />
          </div>
          <button type="submit" id="btn-start-empire"
            class="hud-btn btn-primary-exec w-full py-3 px-5 rounded-lg text-slate-950 font-semibold text-sm cursor-pointer">
            ${hasSaved ? t('resumeGame') : t('startGame')}
          </button>
          ${hasSaved ? `
            <button type="button" data-action="start-new-empire"
              class="hud-btn w-full py-2.5 px-4 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 font-medium text-xs cursor-pointer border border-slate-700/80">
              ${lang === 'de' ? 'Neues Imperium bei $100.000 starten' : 'Start Fresh Empire ($100,000)'}
            </button>
          ` : ''}
        </form>

        <div class="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>${t('controlHint')}</span>
          <span class="font-mono-num text-emerald-400/90 shrink-0">108 Plots · $100k</span>
        </div>
      </div>
    </div>
  `;
}
