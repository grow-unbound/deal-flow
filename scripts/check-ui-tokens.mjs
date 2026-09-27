#!/usr/bin/env node
/**
 * Guardrail for the buyer PWA design-token cleanup (see
 * CLAUDE OUTPUTS/DealFlow/DealFlow_Buyer-Design-Standards_Spec_v1.md).
 * Blocks new raw px font-sizes and raw hex colors in src/components/buyer/**
 * so drift away from the --b-text-, --bg-, --teal-, --cream- token families
 * doesn't silently creep back in.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TARGET_DIR = join(ROOT, 'src/components/buyer');

const RAW_PX_RE = /text-\[\d+px\]|fontSize:\s*['"]?\d+px/g;
const RAW_HEX_RE = /#[0-9A-Fa-f]{3,6}\b/g;
const EXEMPT_MARKER = 'token-exempt';

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

const violations = [];

for (const file of walk(TARGET_DIR)) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes(EXEMPT_MARKER)) return;
    for (const re of [RAW_PX_RE, RAW_HEX_RE]) {
      re.lastIndex = 0;
      const match = re.exec(line);
      if (match) {
        violations.push({ file: relative(ROOT, file), line: i + 1, snippet: match[0] });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('\nBuyer UI token guardrail failed — raw px/hex values found outside app/globals.css:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error(
    '\nUse the existing design tokens instead (--b-text-*, --bg-*, --teal-*, --cream-*, --shadow-*).'
    + ' See CLAUDE OUTPUTS/DealFlow/DealFlow_Buyer-Design-Standards_Spec_v1.md for the mapping.\n'
    + 'If a raw value is genuinely intentional (e.g. a one-off decorative gradient stop with no token'
    + ' equivalent), leave a short comment explaining why, and adjust this script\'s exclusions.\n',
  );
  process.exit(1);
}

console.log('Buyer UI token guardrail passed — no raw px/hex values in src/components/buyer/**.');
