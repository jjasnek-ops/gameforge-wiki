/** Shared sitemap/head policy for pages that may contain English UI fallback. */
export function collectionPath(pathname: string, categories: string[]): boolean {
  return pathname.split('/').some(p => p === 'tags' || categories.includes(p));
}
export function fixedEnglishPage(pathname: string): boolean {
  return /\/(about|contact|copyright|privacy-policy|terms-of-service)\/?$/.test(pathname);
}
export function indexableLocalePage(pathname: string, locale: string, defaultLocale: string, translated: string[], categories: string[]): boolean {
  if (locale === defaultLocale) return true;
  if (fixedEnglishPage(pathname)) return false; // LegalContent is still English.
  return collectionPath(pathname, categories) || translated.includes(locale);
}
