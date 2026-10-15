/** Build-time only: the static site never fetches a facts API in the browser. */
import fs from 'node:fs';
import path from 'node:path';
interface Source { id: string; title: string; url: string; verifiedAt: string; version: string }
const factsFile = path.resolve('facts.json');
const facts: Source[] = fs.existsSync(factsFile) ? JSON.parse(fs.readFileSync(factsFile, 'utf8')) : [];
const siteFile = path.resolve('.gameforge/site.json');
export const testOnly: boolean = fs.existsSync(siteFile) && JSON.parse(fs.readFileSync(siteFile, 'utf8')).testOnly === true;
export function getArticleSources(ids: string[]): Source[] {
  return ids.flatMap(id => { const source = facts.find(s => s.id === id); return source ? [source] : []; });
}
