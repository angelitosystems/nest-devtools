/**
 * Debug: boots server + app, listens as a dashboard client, prints every forwarded event.
 */
import { spawn } from 'child_process';
import WebSocket from 'ws';
import { DevToolsServer } from '../packages/cli/dist/index.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = new DevToolsServer({ httpPort: 4317, wsPort: 4318, host: '127.0.0.1' });
  await server.start();
  console.log('server up');

  const dashboard = new WebSocket('ws://127.0.0.1:4317/ws?client=dashboard');
  dashboard.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.event === 'state.snapshot') {
      console.log('>> state.snapshot: req=' + msg.payload.requests.length + ' logs=' + msg.payload.logs.length + ' errors=' + msg.payload.errors.length);
    } else {
      console.log('>> event:', msg.event, JSON.stringify(msg.payload).slice(0, 120));
    }
  });
  await new Promise((r) => dashboard.once('open', r));

  const app = spawn('bun', ['run', 'src/main.ts'], {
    cwd: process.cwd() + '/examples/basic-nestjs',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, NEST_DEVTOOLS_URL: 'ws://127.0.0.1:4318' },
  });
  app.stdout.on('data', (d) => process.stdout.write('[app] ' + d));
  app.stderr.on('data', (d) => process.stdout.write('[app:err] ' + d));

  await wait(9000);
  try {
    await fetch('http://localhost:3001/cats');
    await fetch('http://localhost:3001/cats/999');
  } catch (e) {
    console.log('fetch failed', e.message);
  }
  await wait(3000);

  app.kill();
  dashboard.close();
  await server.stop();
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
