import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
/** npm/pnpm pass `--` between script flags and args; Vitest treats `--` as "run everything". */
const filtered = rawArgs.filter((a) => a !== '--');
const passthrough = [];

for (let i = 0; i < filtered.length; i += 1) {
  const arg = filtered[i];

  if (arg === '--testPathPattern') {
    const pattern = filtered[i + 1];
    if (pattern) {
      passthrough.push(pattern);
      i += 1;
    }
    continue;
  }

  if (arg.startsWith('--testPathPattern=')) {
    passthrough.push(arg.slice('--testPathPattern='.length));
    continue;
  }

  passthrough.push(arg);
}

const result = spawnSync('vitest', ['run', ...passthrough], {
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
