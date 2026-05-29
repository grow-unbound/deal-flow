import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const passthrough = [];

for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];

  if (arg === '--testPathPattern') {
    const pattern = rawArgs[i + 1];
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
