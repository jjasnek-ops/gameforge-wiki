import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const credentialKey = /^(?:(?:cloudflare|cf)[_-]?)?(?:api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|private[_-]?key)$/i;
const placeholder = (v: string) => !v || /^(?:\$|<|YOUR[_ -]|EXAMPLE[_ -]|REPLACE[_ -]|CHANGE[_ -]?ME|process\.env\.|secrets\.|env\.)/i.test(v) || /^(?:\.\.\.|x{3,}|placeholder|undefined|null|test(?:[-_].*)?|fake(?:[-_].*)?|dummy(?:[-_].*)?)$/i.test(v);
export function secretFindings(raw: string): string[] {
  const issues: string[] = [];
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----(?:\r?\n|\\n)[A-Za-z0-9+/=]{24,}/.test(raw)) issues.push('private key material (value redacted)');
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const report = (rule: string) => issues.push(`line ${index + 1}: ${rule} (value redacted)`);
    if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})\b/.test(line)) report('credential signature');
    for (const m of line.matchAll(/(?<![\w-])(?=["']?([A-Za-z][\w-]*)["']?\s*([:=])\s*(?:(["'])(.*?)\3|([^\s"',;}]*)))/g)) {
      const value = m[4] ?? (m[5] ?? '').split('\\n')[0];
      const literal = !!m[3] || (m[2] === '=' && /^[A-Z][A-Z0-9_]+$/.test(m[1]));
      const plausible = /password/i.test(m[1]) || (value.length >= 16 && !value.startsWith('-----BEGIN '));
      if (literal && plausible && credentialKey.test(m[1]) && !placeholder(value)) report('credential assignment');
    }
    if (/\bBearer\s+[A-Za-z0-9._-]{20,}/i.test(line)) report('bearer credential');
    if (/[?&](?:api[_-]?key|api[_-]?token|access[_-]?token|password|secret)=([^\s&"']+)/i.test(line)) report('credential in URL');
  }
  return [...new Set(issues)];
}
export function assertPublicData(value: unknown, label: string) {
  const issues = secretFindings(JSON.stringify(value, null, 2));
  if (issues.length) throw new Error(`${label}: sensitive data refused\n${issues.join('\n')}`);
}
export function readPublicJson(file: string, label: string): unknown {
  const raw = fs.readFileSync(file, 'utf8');
  const findings = secretFindings(raw);
  if (findings.length) throw new Error(`${label}: sensitive data refused\n${findings.join('\n')}`);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`${label}: invalid JSON (input details redacted)`); }
  assertPublicData(parsed, label);
  return parsed;
}
export function sensitivePath(relative: string): boolean {
  const parts = relative.replace(/\\/g, '/').split('/');
  return parts.some(p => /^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.yarnrc.*|\.aws|\.ssh|credentials?(?:\.(?:json|ya?ml|toml|txt))?|secrets?(?:\.(?:json|ya?ml|toml|txt))?|\.netrc|\.pypirc)(?:$)/i.test(p) && !/^\.env\.(?:example|template)$/.test(p)) ||
    /(?:^|\/)(?:id_(?:rsa|ed25519)|.*[-.]secret\.json)$|\.(?:pem|key|p8|p12|pfx|jks|keystore)$/i.test(relative);
}
const rootFiles = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.nvmrc', '.gitignore', '.gitattributes', '.env.example', '.prettierignore', '.prettierrc', 'eslint.config.js', 'astro.config.ts', 'tailwind.config.mjs', 'tailwind.config.ts', 'tsconfig.json', 'vitest.config.ts', 'wrangler.toml', 'README.md', 'AGENTS.md', 'LICENSE']);
// Explicit build/editor/gate scripts; newly added factory/research scripts do
// not automatically become distributable just because they end in .ts.
const productionScripts = new Set([
  'apply-template.ts', 'audit-branding.ts', 'bulk-new-posts.ts', 'check-config.ts', 'check-content.ts', 'check-evidence.ts', 'check-i18n.ts', 'check-links.ts',
  'check-secrets.ts', 'check-seo.ts', 'check-sitemap.ts', 'check-sources.ts', 'configure-game.ts', 'finalize-site.ts', 'gen-assets.ts', 'gen-covers.ts',
  'init-indexnow-key.ts', 'install-hooks.mjs', 'new-locale.ts', 'new-post.ts', 'plan-content.ts', 'predeploy.ts', 'refresh-audit.ts', 'submit-indexnow.ts',
  'subset-font.d.ts', 'sync-codes.ts', 'transpile-pagefind.mjs', 'write-indexnow-key.ts',
  ...['apply-rewrites', 'apply-template-i18n', 'asset-extensions', 'atomic', 'branding-policy', 'branding', 'configure-game', 'delimited', 'fonts', 'gameforge',
    'indexnow', 'link-scan', 'prompt', 'routing-flags', 'run', 'security', 'seo-audit', 'slugify', 'source-links', 'sync-codes', 'today', 'walk'].map(name => `lib/${name}.ts`),
]);
export function productionFile(relative: string): boolean {
  const rel = relative.replace(/\\/g, '/');
  if (rel.split('/').some(p => !p || p === '..' || /^(?:node_modules|dist|\.astro|\.git|\.cache|coverage|reports?|out|tmp|temp)$/i.test(p)) || sensitivePath(rel)) return false;
  if (/(?:^|\/)(?:notes?|scratch|personal|debug)(?:[._-]|$)|\.(?:log|tmp|bak|old|zip|csv|sqlite|db)$/i.test(rel)) return false;
  // The independent site is not another copy of the factory or its manuals.
  if (/^(?:docs\/|\.agent\/|src\/content\/wiki\/|src\/assets\/|public\/images\/|public\/ads\/)/.test(rel)) return false;
  if (/^src\/(?:components\/landing\/|config\/landing|pages\/(?:landing(?:\.|\/)|demo\.astro|zh\/landing))/.test(rel)) return false;
  if (['README.md', 'AGENTS.md', '.env.example', 'src/lib/handbook.ts'].includes(rel)) return false;
  if (/^licenses\/(?:[a-z][a-z-]+\.txt|manifest\.json)$/.test(rel)) return true;
  if (rootFiles.has(rel)) return true;
  if (/^src\/.+\.(?:ts|js|mjs|astro|css|mdx|json|svg|png|jpe?g|webp|gif|avif|woff2?|ttf|otf)$/.test(rel)) return !/\.(?:test|spec)\./.test(rel);
  if (/^scripts\/fonts\/(?:[A-Za-z0-9_-]+\.(?:ttf|otf)|OFL\.txt|LICENSE(?:\.txt)?)$/.test(rel)) return true;
  if (rel.startsWith('scripts/')) return productionScripts.has(rel.slice(8));
  if (/^public\/fonts\/.+\.(?:woff2?|ttf|otf)$/.test(rel)) return true;
  return /^public\/(?:_headers|_redirects|manifest\.json|ads\.txt|favicon(?:-\d+x\d+)?\.(?:svg|png|ico)|apple-touch-icon\.png|android-chrome-\d+x\d+\.png)$/.test(rel) ||
    /^tests\/(?:gameforge-site|hardening|branding)\.test\.ts$/.test(rel) || rel === '.githooks/pre-commit';
}
export function productionFiles(root: string): string[] {
  const files = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(productionFile);
  for (const rel of files) {
    let current = root;
    for (const part of rel.split('/')) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic link in production copy: ${rel}`);
    }
    if (!fs.statSync(current).isFile()) throw new Error(`Not a regular production file: ${rel}`);
    const raw = fs.readFileSync(current);
    if (!raw.subarray(0, 8192).includes(0)) {
      const issues = secretFindings(raw.toString('utf8'));
      if (issues.length) throw new Error(`${rel}: sensitive data refused\n${issues.join('\n')}`);
    }
  }
  return files;
}
