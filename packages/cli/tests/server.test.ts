import { describe, expect, it, afterAll } from 'bun:test';
import { WebSocket } from 'ws';
import { createMessage, parseMessage } from '@angelitosystems/devtools-protocol';
import type { DevToolsMessage, LogPayload } from '@angelitosystems/devtools-protocol';
import { DevToolsServer } from '../src/server/server';

const HTTP_PORT = 4343;
const WS_PORT = 4344;

describe('DevToolsServer', () => {
  const server = new DevToolsServer({ httpPort: HTTP_PORT, wsPort: WS_PORT, host: 'localhost' });

  afterAll(async () => {
    await server.stop();
  });

  it('starts and serves /health', async () => {
    await server.start();
    const response = await fetch(`http://localhost:${HTTP_PORT}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('accepts a project connection and stores its events', async () => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}?projectId=test-api`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const log: LogPayload = {
      projectId: 'test-api',
      level: 'info',
      message: 'hello from test',
      processId: 1,
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(createMessage('log.created', log)));

    // give the server a beat to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    const status = server.status();
    expect(status.projects.length).toBe(1);
    expect(status.projects[0].info.projectId).toBe('test-api');
    expect(status.totalLogs).toBe(1);

    const snapshot = server.getStore().snapshot();
    expect(snapshot.logs.some((l) => l.message === 'hello from test')).toBe(true);

    ws.close();
  });

  it('broadcasts project events to dashboard clients', async () => {
    const dashboard = new WebSocket(`ws://localhost:${HTTP_PORT}/ws?client=dashboard`);
    const messages: DevToolsMessage[] = [];
    dashboard.on('message', (raw) => {
      const parsed = parseMessage(raw.toString());
      if (parsed) messages.push(parsed);
    });
    await new Promise((resolve) => dashboard.once('open', resolve));

    const project = new WebSocket(`ws://localhost:${WS_PORT}?projectId=test-api-2`);
    await new Promise((resolve) => project.once('open', resolve));

    project.send(
      JSON.stringify(
        createMessage('error.created', {
          projectId: 'test-api-2',
          name: 'TypeError',
          message: 'x is not a function',
          fingerprint: 'abc123',
          timestamp: Date.now(),
        }),
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(messages.some((m) => m.event === 'project.connected')).toBe(true);
    expect(messages.some((m) => m.event === 'error.created')).toBe(true);

    dashboard.close();
    project.close();
  });

  it('supports state.clear from a dashboard client', async () => {
    const dashboard = new WebSocket(`ws://localhost:${HTTP_PORT}/ws?client=dashboard`);
    await new Promise((resolve) => dashboard.once('open', resolve));

    dashboard.send(JSON.stringify(createMessage('state.clear', { scope: 'all' })));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const counters = server.getStore().counters();
    expect(counters.totalLogs).toBe(0);
    dashboard.close();
  });
});
