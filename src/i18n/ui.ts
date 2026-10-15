/**
 * UI message loader — runtime bridge between locale JSON files and components.
 *
 * Responsibilities:
 *   - Load the messages object for a given locale.
 *   - deepMerge non-English locales over English, so missing keys fall back to English.
 *
 * Only manages UI text (nav labels, buttons, home content). Article body translation
 * is handled by src/i18n/content.ts (MDX file-based, per-article fallback).
 */

import en from '~/locales/en.json';
import ja from '~/locales/ja.json';

import { isLocale, type Locale } from './routing';

const messages: Record<Locale, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  ja: ja as Record<string, unknown>,
};

/**
 * Deep-merge `source` over `base`. Arrays are replaced (not concatenated);
 * objects are merged recursively. Used to layer a partial translation over
 * the full English messages so missing keys transparently fall back.
 */
function deepMerge(
  base: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof base !== 'object' || base === null) return source;
  if (typeof source !== 'object' || source === null) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Deep-freeze a UI tree. Every getUi() result shares structure with the
 * `en` module table (deepMerge shallow-copies base and assigns arrays by
 * reference), so one caller mutating its copy would silently poison every
 * other locale's view. Freezing turns that corruption class into a loud
 * TypeError in strict-mode modules instead — all ~20 call sites are
 * read-only (audited 2026-10-03, round 35), pinned by tests/i18n-smoke.
 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// Freeze via the messages map, NOT via bare `en`/`ja` identifiers: the
// apply-template CLI rewrites the import block and this literal for forks
// that drop locales (their imports are stripped), so any reference to a
// stripped identifier outside those regions is a fork-only ReferenceError.
// `en` alone is fork-safe (always a chosen locale); the loop covers every
// table that actually ships. Pinned by tests/apply-template.test.ts.
for (const table of Object.values(messages)) deepFreeze(table);

/**
 * Get the full UI messages object for a locale, with English fallback.
 * Never throws — unknown locales return English. Non-default locales are
 * deep-merged once and cached, and every result is deeply frozen: treat it
 * as read-only because it IS read-only (mutation throws).
 */
const uiCache = new Map<Locale, typeof en>();

export function getUi(locale: string): typeof en {
  if (locale === 'en') return en;
  if (isLocale(locale)) {
    const cached = uiCache.get(locale);
    if (cached) return cached;
    const merged = deepFreeze(
      deepMerge(en as Record<string, unknown>, messages[locale]),
    ) as typeof en;
    uiCache.set(locale, merged);
    return merged;
  }
  return deepFreeze(deepMerge(en as Record<string, unknown>, {})) as typeof en;
}

/** The homepage `home` namespace (drives HomePage + the /faq pages). */
export type HomeUi = typeof en.home;
/** The `shared` namespace (cross-page labels). */
export type SharedUi = typeof en.shared;

/**
 * The homepage FAQ namespace (`home.faq`) for a locale — the single source
 * both /faq routes render from. Deduplicated from two page-level copies that
 * each carried a hardcoded English fallback masking key drift; typed against
 * en.json instead, so a renamed `home.faq` key fails typecheck (and
 * tests/home-ui.test.ts) rather than silently rendering an empty page.
 * ja and future locales inherit en values via getUi()'s deep-merge.
 */
export function getHomeFaq(locale: string): HomeUi['faq'] {
  return getUi(locale).home.faq;
}
