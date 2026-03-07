import { spawnSync } from 'node:child_process';

if (process.env.SKIP_ADMIN_POSTINSTALL === '1') {
  process.exit(0);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'install:admin'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('[postinstall] failed to install admin dependencies', result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
