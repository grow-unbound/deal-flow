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
  env: {
    ...process.env,
    // Node's own experimental global `localStorage` (stable-ish since Node 22+) shadows
    // jsdom's `window.localStorage` when no --localstorage-file backing is configured,
    // making `window.localStorage` undefined in any jsdom test that touches it. Disabling
    // Node's own implementation lets jsdom's (the one tests actually want) take over.
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-experimental-webstorage'].filter(Boolean).join(' '),
  },
});

process.exit(result.status ?? 1);
