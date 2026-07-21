import fs from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync(
  "rg -l \"toLocaleString\\\\('en-IN'\\\\)|toFixed\\\\(1\\\\)|₹\\\\$\\\\{\" --glob '*.{ts,tsx}' src app",
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.includes('number-format.ts') && !f.includes('archived/'));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  content = content.replace(/\$\{([^}]+)\.toFixed\(1\)\}%/g, (_, expr) => `\${formatNumberValue(${expr}, 'PERCENTAGE')}`);
  content = content.replace(/\{([^}]+)\.toFixed\(1\)\}%/g, (_, expr) => `{formatNumberValue(${expr}, 'PERCENTAGE')}`);
  content = content.replace(/`₹\$\{Math\.round\(([^}]+)\)\.toLocaleString\('en-IN'\)\}`/g, (_, expr) => `formatNumberValue(Math.round(${expr}), 'CURRENCY_EXACT')`);
  content = content.replace(/`₹\$\{([^}]+)\.toLocaleString\('en-IN'\)\}`/g, (_, expr) => `formatNumberValue(${expr}, 'CURRENCY_EXACT')`);
  content = content.replace(/`₹\$\{([^}]+)\}`/g, (match, expr) => {
    if (expr.includes('formatNumberValue')) return match;
    return `formatNumberValue(${expr}, 'CURRENCY_EXACT')`;
  });
  content = content.replace(/([a-zA-Z0-9_?.()[\]+-]+)\.toLocaleString\('en-IN'\)/g, (match, expr) => {
    if (expr.includes('Date') || match.includes('formatNumberValue')) return match;
    return `formatNumberValue(${expr}, 'COUNT')`;
  });

  if (content.includes('formatNumberValue(') && !content.includes("from '@/lib/utils'")) {
    const firstImport = content.search(/^import /m);
    if (firstImport >= 0) {
      content = `${content.slice(0, firstImport)}import { formatNumberValue } from '@/lib/utils';\n${content.slice(firstImport)}`;
    }
  } else if (content.includes('formatNumberValue(')) {
    content = content.replace(/import \{([^}]+)\} from '@\/lib\/utils'/g, (m, imports) => {
      const names = imports.split(',').map((s) => s.trim()).filter(Boolean);
      if (!names.includes('formatNumberValue')) names.push('formatNumberValue');
      return `import { ${names.join(', ')} } from '@/lib/utils'`;
    });
  }

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log('inline', file);
  }
}
