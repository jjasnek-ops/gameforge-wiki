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
export function sensitivePath(relative: string): boolean {
  const parts = relative.replace(/\\/g, '/').split('/');
  return parts.some(p => /^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.yarnrc.*|\.aws|\.ssh|credentials?(?:\.(?:json|ya?ml|toml|txt))?|secrets?(?:\.(?:json|ya?ml|toml|txt))?|\.netrc|\.pypirc)(?:$)/i.test(p) && !/^\.env\.(?:example|template)$/.test(p)) ||
    /(?:^|\/)(?:id_(?:rsa|ed25519)|.*[-.]secret\.json)$|\.(?:pem|key|p8|p12|pfx|jks|keystore)$/i.test(relative);
}
const rootFiles = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.nvmrc', '.gitignore', '.gitattributes', '.env.example', '.prettierignore', '.prettierrc', 'eslint.config.js', 'astro.config.ts', 'tailwind.config.mjs', 'tailwind.config.ts', 'tsconfig.json', 'vitest.config.ts', 'wrangler.toml', 'README.md', 'AGENTS.md', 'LICENSE']);
export function productionFile(relative: string): boolean {
  const rel = relative.replace(/\\/g, '/');
  if (rel.split('/').some(p => !p || p === '..' || /^(?:node_modules|dist|\.astro|\.git|\.cache|coverage|reports?|out|tmp|temp)$/i.test(p)) || sensitivePath(rel)) return false;
  if (/(?:^|\/)(?:notes?|scratch|personal|debug)(?:[._-]|$)|\.(?:log|tmp|bak|old|zip|csv|sqlite|db)$/i.test(rel)) return false;
  if (/^docs\/(?:superpowers|audits)\//.test(rel)) return false;
  if (rootFiles.has(rel)) return true;
  if (/^src\/.+\.(?:ts|js|mjs|astro|css|mdx|json|svg|png|jpe?g|webp|gif|avif|woff2?|ttf|otf)$/.test(rel)) return !/\.(?:test|spec)\./.test(rel);
  if (/^scripts\/fonts\/(?:[A-Za-z0-9_-]+\.(?:ttf|otf)|OFL\.txt|LICENSE(?:\.txt)?)$/.test(rel)) return true;
  if (/^scripts\/.+\.(?:ts|mjs)$/.test(rel)) return !/^scripts\/(?:test-games\.ts|e2e-apply-template\.mjs|gen-demo-media\.mjs)$/.test(rel);
  if (/^docs\/.+\.md$/.test(rel) || /^\.agent\/skills\/.+\.(?:md|ts|mjs)$/.test(rel)) return true;
  if (/^public\/(?:images|fonts|ads)\/.+\.(?:svg|png|jpe?g|webp|gif|avif|woff2?|ttf|otf|html)$/.test(rel)) return true;
  return /^public\/(?:_headers|_redirects|manifest\.json|ads\.txt|favicon(?:-\d+x\d+)?\.(?:svg|png|ico)|apple-touch-icon\.png|android-chrome-\d+x\d+\.png)$/.test(rel) ||
    /^tests\/(?:gameforge-site|hardening)\.test\.ts$/.test(rel) || rel === '.githooks/pre-commit';
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
