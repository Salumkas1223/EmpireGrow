import { t, getLanguage, setLanguage } from '../../../localization/i18n.js';

export function renderTitleScreen(savedMeta) {
  const lang = getLanguage();
  const hasSaved = Boolean(savedMeta?.playerId);
  const defaultName = savedMeta?.name || 'Alexander Vance';
  const defaultEmpire = savedMeta?.empireName || 'Vance Global Holdings';

  return `
    <div id="title-overlay" class="fixed inset-0 z-40 flex items-center justify-start p-6 md:p-14 pointer-events-none">
      <div class="max-w-lg w-full hud-surface rounded-2xl p-7 md:p-9 pointer-events-auto shadow-2xl">
        <div class="flex items-center justify-between gap-4 mb-6">
          <div class="flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect x="2" y="14" width="8" height="20" rx="1.5" fill="#0284c7" />
              <rect x="13" y="4" width="10" height="30" rx="1.5" fill="#38bdf8" />
              <rect x="26" y="10" width="8" height="24" rx="1.5" fill="#818cf8" />
              <rect x="16" y="9" width="4" height="4" fill="#090d16" />
              <rect x="16" y="16" width="4" height="4" fill="#090d16" />
            </svg>
            <div>
              <h1 class="font-display text-2xl md:text-3xl font-bold tracking-tight text-white">DIGITALEMPIRE</h1>
              <p class="text-xs text-slate-400">${t('appSubtitle')}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-700/60">
            <button data-action="set-lang" data-lang="de" class="px-2.5 py-1 text-xs font-medium rounded ${lang === 'de' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'}">DE</button>
            <button data-action="set-lang" data-lang="en" class="px-2.5 py-1 text-xs font-medium rounded ${lang === 'en' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'}">EN</button>
          </div>
        </div>

        <form id="launch-form" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">${t('ceoNameLabel')}</label>
            <input id="input-ceo-name" type="text" value="${defaultName}" maxlength="32" required
              class="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-sky-400" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">${t('empireNameLabel')}</label>
            <input id="input-empire-name" type="text" value="${defaultEmpire}" maxlength="40" required
              class="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-sky-400" />
          </div>
          <button type="submit" id="btn-start-empire"
            class="w-full py-3 px-5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer">
            ${hasSaved ? t('resumeGame') : t('startGame')}
          </button>
          ${hasSaved ? `
            <button type="button" data-action="start-new-empire"
              class="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors cursor-pointer border border-slate-700">
              ${lang === 'de' ? 'Neues Imperium bei $100.000 starten' : 'Start Fresh Empire ($100,000)'}
            </button>
          ` : ''}
        </form>

        <div class="mt-5 pt-4 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
          ${t('controlHint')}
        </div>
      </div>
    </div>
  `;
}
