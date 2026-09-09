import { describe, expect, it } from 'bun:test';
import { DEFAULT_WS_URL, LatencyTracker, resolveConfig, shouldSample, slugify, DevToolsTransport } from '../src';

describe('config', () => {
  it('falls back to sane defaults', () => {
    const config = resolveConfig({});
    expect(config.enabled).toBe(true); // bun test runs without NODE_ENV=production
    expect(config.server).toBe(DEFAULT_WS_URL);
    expect(config.capture.requests).toBe(true);
    expect(config.environment.length).toBeGreaterThan(0);
  });

  it('honors explicit options', () => {
    const config = resolveConfig({ enabled: false, project: 'My API', server: 'ws://localhost:9999' });
    expect(config.enabled).toBe(false);
    expect(config.projectId).toBe('my-api');
    expect(config.server).toBe('ws://localhost:9999');
  });

  it('slugifies project names', () => {
    expect(slugify('@scope/Cool App')).toBe('cool-app');
    expect(slugify('---')).toBe('nestjs-app');
  });
});

describe('sampling + latency', () => {
  it('samples deterministically at extremes', () => {
    expect(shouldSample(1)).toBe(true);
    expect(shouldSample(0)).toBe(false);
  });

  it('computes percentiles', () => {
    const tracker = new LatencyTracker();
    for (let i = 1; i <= 100; i++) tracker.add(i);
    expect(tracker.average()).toBeCloseTo(50.5, 1);
    expect(tracker.percentile(95)).toBeGreaterThanOrEqual(95);
    expect(tracker.percentile(99)).toBeGreaterThanOrEqual(99);
  });
});

describe('transport', () => {
  it('buffers while offline and never throws', () => {
    const transport = new DevToolsTransport('ws://localhost:1', {
      projectId: 'test',
      bufferSize: 10,
      flushInterval: 1000,
    });
    transport.start();
    // no server on port 1: enqueue must not throw
    for (let i = 0; i < 25; i++) {
      transport.send('log.created', {
        projectId: 'test',
        level: 'info',
        message: `msg ${i}`,
        processId: 1,
        timestamp: Date.now(),
      });
    }
    expect(transport.pending()).toBeGreaterThan(0);
    transport.stop();
  });

  it('flushes nothing when closed', () => {
    const transport = new DevToolsTransport('ws://localhost:1', { projectId: 'test' });
    expect(() => transport.flush()).not.toThrow();
    transport.stop();
  });
});
