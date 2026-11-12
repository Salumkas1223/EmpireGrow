import de from './de.json';
import en from './en.json';

const dictionaries = { de, en };
let currentLang = 'de';
const listeners = new Set();

export function setLanguage(lang) {
  currentLang = lang === 'en' ? 'en' : 'de';
  document.documentElement.lang = currentLang;
  for (const cb of listeners) cb(currentLang);
}

export function getLanguage() {
  return currentLang;
}

export function onLanguageChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function t(path, fallback) {
  const dict = dictionaries[currentLang] || dictionaries.de;
  const parts = path.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) {
      cur = cur[p];
    } else {
      return fallback || path;
    }
  }
  return typeof cur === 'string' ? cur : (fallback || path);
}

export function locName(obj) {
  if (!obj) return '';
  return currentLang === 'en' ? (obj.nameEn || obj.titleEn || obj.nameDe || '') : (obj.nameDe || obj.titleDe || obj.nameEn || '');
}

export function locDesc(obj) {
  if (!obj) return '';
  return currentLang === 'en' ? (obj.descEn || obj.bonusEn || obj.descDe || '') : (obj.descDe || obj.bonusDe || obj.descEn || '');
}
