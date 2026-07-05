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

const sellerApiRoots = [
  'app/api/tenant',
  'app/api/settings',
  'app/api/team',
  'app/api/whatsapp',
  'app/api/brands',
  'app/api/products',
  'app/api/customers',
  'app/api/cohorts',
  'app/api/price-lists',
];

const cacheMarkers = [
  'SELLER_CACHE_',
  'SELLER_GET_CACHE_CONTROL',
  'APP_GET_CACHE_CONTROL',
  'Cache-Control',
  'jsonWithServerTiming',
  'seller-cache-exempt',
];

const noStoreExemptions = [
  '/pdf/',
  '/template/',
  '/oauth/',
  '/debug/',
  '/upload/',
];

for (const apiRoot of sellerApiRoots) {
  const abs = join(root, apiRoot);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs).filter((path) => path.endsWith('route.ts'))) {
    const rel = relative(root, file);
    const normalized = `/${rel}`;
    const text = readFileSync(file, 'utf8');
    if (!text.includes('export async function GET')) continue;
    if (noStoreExemptions.some((part) => normalized.includes(part))) continue;
    if (!cacheMarkers.some((marker) => text.includes(marker))) {
      add(file, 1, 'seller GET route needs a shared private cache header or an explicit no-store exemption.');
    }
  }
}

const sellerComponents = walk(join(root, 'src/components/seller')).filter((file) => /\.(tsx|ts)$/.test(file));
for (const file of sellerComponents) {
  const rel = relative(root, file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (!line.includes('<img')) return;
    const prior = lines.slice(Math.max(0, index - 3), index).join('\n');
    if (prior.includes('seller-image-raw-exempt')) return;
    add(file, index + 1, 'seller persisted imagery must use next/image with unoptimized.');
  });

  if (text.includes('from \'recharts\'') || text.includes('from "recharts"')) {
    const allowed = /src\/components\/seller\/(brands|catalogs|categories|cohorts|customers|locations|products)\/detail\/.*(Performance|Overview)Tab\.tsx$/.test(rel);
    if (!allowed) {
      add(file, 1, 'recharts imports must stay in dynamically imported seller detail tabs.');
    }
  }
}

if (findings.length > 0) {
  console.error('Seller performance parity audit found issues:\n');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.message}`);
  }
  process.exit(1);
}

console.log('Seller performance parity audit passed.');
