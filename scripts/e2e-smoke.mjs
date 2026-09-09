/**
 * E2E smoke: boots the real DevTools server, boots the example NestJS app,
 * generates traffic, then verifies what arrived in the server store.
 */
import { spawn } from 'child_process';
import { createServer } from 'http';
import { DevToolsServer } from '../packages/cli/dist/index.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch {
      /* retry */
    }
    await wait(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  // 1. DevTools server
  const server = new DevToolsServer({ httpPort: 4317, wsPort: 4318, host: 'localhost' });
  const events = [];
  server.options; // keep reference alive
  await server.start();
  console.log('✓ DevTools server started (http 4317 / ws 4318)');

  // 2. example NestJS app
  const app = spawn('bun', ['run', 'src/main.ts'], {
    cwd: new URL('../examples/basic-nestjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  let appOutput = '';
  app.stdout.on('data', (d) => (appOutput += d));
  app.stderr.on('data', (d) => (appOutput += d));
  const appExit = new Promise((resolve) => app.on('exit', resolve));

  try {
    await waitFor(async () => {
      const res = await fetch('http://localhost:3001/cats');
      return res.status === 200 || res.status === 404; // app up, route check below
    }, 30000, 'example app to boot');
    console.log('✓ Example NestJS app is up on :3001');

    // 3. traffic
    for (let i = 0; i < 6; i++) await fetch('http://localhost:3001/cats');
    await fetch('http://localhost:3001/cats/1');
    await fetch('http://localhost:3001/cats/999');
    await fetch('http://localhost:3001/cats?pretty=1');
    await fetch('http://localhost:3001/cats', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer super-secret-value' },
      body: JSON.stringify({ name: 'Felix', password: 'hunter2' }),
    });
    console.log('✓ Traffic generated (requests, logs, one 500 error)');

    // 4. verify server-side state
    const ok = await waitFor(async () => {
      const snapshot = server.getStore().snapshot();
      return snapshot.requests.length >= 5 && snapshot.logs.length >= 3 && snapshot.errors.length >= 1;
    }, 15000, 'events to flow through the websocket');

    const snap = server.getStore().snapshot();
    const status = server.status();

    console.log('');
    console.log('── server state ──────────────────────────────');
    console.log(`projects:       ${status.projects.map((p) => `${p.info.projectId}${p.connected ? '' : ' (disconnected)'}`).join(', ')}`);
    console.log(`requests:       ${snap.requests.length} captured`);
    console.log(`logs:           ${snap.logs.length} captured`);
    console.log(`errors:         ${snap.errors.length} captured`);
    console.log('');

    const lastPost = snap.requests.filter((r) => r.method === 'POST').at(-1);
    if (lastPost) console.log(`POST captured:  ${lastPost.method} ${lastPost.url} → ${lastPost.statusCode} (${lastPost.duration}ms, ${lastPost.timeline.length} timeline spans)`);

    const err = snap.errors.at(-1);
    if (err) console.log(`error captured: ${err.name}: ${err.message} @ ${err.source ? `${err.source.file}:${err.source.line}` : 'no source'} (fp ${err.fingerprint})`);

    const log = snap.logs.at(-1);
    if (log) console.log(`log captured:   [${log.level}] ${log.message} (requestId: ${log.requestId ?? 'none'})`);

    if (!ok) throw new 'not all data arrived';

    console.log('');
    console.log('✓ E2E smoke passed');
  } finally {
    app.kill();
    await Promise.race([appExit, wait(2000)]);
    await server.stop();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('✗ E2E smoke failed:', error);
    process.exit(1);
  },
);
