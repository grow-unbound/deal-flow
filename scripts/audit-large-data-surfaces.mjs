import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const findings = [];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git' || entry === '.claude') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function add(file, line, message) {
  findings.push({ file: relative(root, file), line, message });
}

const files = [
  ...walk(join(root, 'app')),
  ...walk(join(root, 'src')),
  ...walk(join(root, 'scripts')),
].filter((file) => /\.(ts|tsx|mjs|js)$/.test(file));

for (const file of files) {
  const rel = relative(root, file);
  if (rel.startsWith('scripts/audit-large-data-surfaces')) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('fetchAllRows') && !rel.endsWith('src/lib/server/fetch-all-rows.ts')) {
      add(file, index + 1, 'fetchAllRows must not be used by initial page/composer loads.');
    }
    const hardLimit = line.match(/\.limit\((\d+)\)/);
    if (hardLimit && Number(hardLimit[1]) > 100) add(file, index + 1, `hard limit ${hardLimit[1]} exceeds the 100-record framework cap.`);
    if (line.includes('full list') || line.includes('full tenant') || line.includes('full-table')) {
      add(file, index + 1, 'comment suggests an unbounded/full-list load; verify it is summary/options-only or paginate it.');
    }
  });
}

const appFiles = walk(join(root, 'app')).filter((file) => /page\.tsx$/.test(file));
for (const page of appFiles) {
  const rel = relative(root, page);
  if (rel === 'app/page.tsx') continue;
  const loading = page.replace(/page\.tsx$/, 'loading.tsx');
  try {
    statSync(loading);
  } catch {
    add(page, 1, 'page.tsx has no sibling loading.tsx skeleton.');
  }
}

if (findings.length > 0) {
  console.error('Large data surface audit found issues:\n');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.message}`);
  }
  process.exit(1);
}

console.log('Large data surface audit passed.');
