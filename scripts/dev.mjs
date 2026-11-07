// Dev loop: proxy in MOCK mode + tsup --watch. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['proxy/server.mjs'], { stdio: 'inherit', env: { ...process.env, MOCK: process.env.MOCK ?? '1' } }),
  spawn('npx', ['tsup', '--watch'], { stdio: 'inherit' })
];
spawn('node', ['scripts/copy-assets.mjs'], { stdio: 'inherit' });
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
