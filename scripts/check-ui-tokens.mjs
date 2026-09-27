#!/usr/bin/env node
/**
 * Design-token guardrail (buyer + seller apps). Blocks NEW raw px font sizes and raw hex colors
 * in src/components/** and app/**; styling must come from the tokens in app/globals.css.
 *
 * Ratchet: existing debt is frozen in scripts/ui-token-baseline.json (file -> allowed count).
 * A file may not exceed its baseline; a file absent from the baseline must have zero.
 *   node scripts/check-ui-tokens.mjs            check (exit 1 on regression)
 *   node scripts/check-ui-tokens.mjs --update   rewrite the baseline (use after paying debt down)
 * Intentional one-offs: add a `token-exempt` comment on the line, with a reason.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const BASELINE = join(import.meta.dirname, 'ui-token-baseline.json');
const DIRS = ['src/components', 'app'];
const RAW_PX_RE = /text-\[\d+px\]|fontSize:\s*['"]?\d+px/g;
const RAW_HEX_RE = /(?<![&\w/])#[0-9A-Fa-f]{3,8}\b(?![-\w])/g;
const EXEMPT = 'token-exempt';

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e) && !/\.(test|spec)\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

const found = {};
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    let n = 0;
    readFileSync(file, 'utf8').split('\n').forEach((line) => {
      if (line.includes(EXEMPT) || /href=["']#|&#\d/.test(line)) return;
      for (const re of [RAW_PX_RE, RAW_HEX_RE]) { re.lastIndex = 0; if (re.test(line)) { n++; break; } }
    });
    if (n) found[relative(ROOT, file)] = n;
  }
}

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, JSON.stringify(Object.fromEntries(Object.entries(found).sort()), null, 2) + '\n');
  console.log(`Baseline written: ${Object.keys(found).length} files, ${Object.values(found).reduce((a, b) => a + b, 0)} lines.`);
  process.exit(0);
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const regress = Object.entries(found).filter(([f, n]) => n > (base[f] ?? 0));
const improved = Object.entries(base).filter(([f, n]) => (found[f] ?? 0) < n);

if (regress.length) {
  console.error('\nUI token guardrail failed — new raw px font-size / hex color values (use tokens from app/globals.css):\n');
  for (const [f, n] of regress) console.error(`  ${f}: ${n} (allowed ${base[f] ?? 0})`);
  console.error('\nAdd/use a token instead. Genuine one-off: add a `token-exempt` comment with a reason.\n');
  process.exit(1);
}
const total = Object.values(found).reduce((a, b) => a + b, 0);
console.log(`UI token guardrail passed — ${total} legacy raw lines in ${Object.keys(found).length} files (frozen baseline).`);
if (improved.length) console.log(`Debt paid down in ${improved.length} file(s): run \`node scripts/check-ui-tokens.mjs --update\` to lock it in.`);
