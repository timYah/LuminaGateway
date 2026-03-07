import { spawn } from 'node:child_process';

const target = process.argv[2];
const extraArgs = process.argv.slice(3);
const platformCommand = (name) => (process.platform === 'win32' ? `${name}.cmd` : name);

const readCliFlag = (flag) => {
  const index = extraArgs.indexOf(flag);
  if (index === -1) {
    return '';
  }
  return extraArgs[index + 1] || '';
};

const requestedHost =
  readCliFlag('--host') ||
  process.env.npm_config_host ||
  (target === 'gateway' ? process.env.GATEWAY_HOST : process.env.ADMIN_HOST) ||
  process.env.HOST ||
  '';

const env = { ...process.env };
let command = '';
let args = [];

if (target === 'gateway') {
  if (requestedHost) {
    env.GATEWAY_HOST = requestedHost;
  }
  command = platformCommand('tsx');
  args = ['watch', 'src/index.ts'];
} else if (target === 'admin') {
  command = platformCommand('npm');
  args = ['--prefix', 'apps/admin', 'run', 'dev'];
  if (requestedHost) {
    args.push('--', '--host', requestedHost);
  }
} else {
  console.error(`Unknown dev target: ${target}`);
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env,
});

child.on('error', (error) => {
  console.error(`[dev:${target}] failed to start`, error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
