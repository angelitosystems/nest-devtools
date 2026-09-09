import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_REDACT_KEYS,
  Redactor,
  buildEditorUrl,
  createMessage,
  cursorUrl,
  isDevToolsEventName,
  parseMessage,
  vscodeUrl,
} from '../src';

describe('redaction', () => {
  const redactor = new Redactor();

  it('redacts default sensitive keys deeply', () => {
    const input = {
      user: { password: 'hunter2', name: 'Ada' },
      authorization: 'Bearer abc',
      nested: [{ apiKey: '123', keep: 1 }],
    };
    const out = redactor.redact(input) as any;
    expect(out.user.password).toBe('[REDACTED]');
    expect(out.user.name).toBe('Ada');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.nested[0].apiKey).toBe('[REDACTED]');
    expect(out.nested[0].keep).toBe(1);
  });

  it('supports custom deny and allow lists', () => {
    const custom = new Redactor({ redact: ['unicorn'], allow: ['token'] });
    expect(custom.isSensitive('unicorn')).toBe(true);
    expect(custom.isSensitive('token')).toBe(false);
    expect(custom.isSensitive('password')).toBe(true);
  });

  it('partial-matches sensitive keys', () => {
    expect(redactor.isSensitive('userPassword')).toBe(true);
    expect(redactor.isSensitive('x-api-key')).toBe(true);
    expect(redactor.isSensitive('emailAddress')).toBe(false);
  });

  it('handles circular structures', () => {
    const obj: any = { name: 'x' };
    obj.self = obj;
    expect(redactor.redact(obj)).toEqual({ name: 'x', self: '[Circular]' });
  });

  it('scrubs secrets from free-form strings', () => {
    expect(redactor.redactString('password=hunter2 and Bearer abc.def.ghi')).not.toContain('hunter2');
    expect(redactor.redactString('password=hunter2')).not.toContain('hunter2');
  });

  it('truncates oversized payloads', () => {
    const small = new Redactor({ maxBytes: 64 });
    const out = small.serialize({ big: 'x'.repeat(1000) });
    expect(out.length).toBeLessThan(100);
    expect(out).toContain('[truncated]');
  });

  it('defaults cover the spec list', () => {
    for (const key of ['password', 'token', 'access_token', 'refresh_token', 'authorization', 'cookie', 'secret', 'apiKey', 'client_secret']) {
      expect(DEFAULT_REDACT_KEYS).toContain(key);
    }
  });
});

describe('protocol messages', () => {
  it('creates typed messages with defaults', () => {
    const msg = createMessage('log.created', { level: 'info', message: 'hi', projectId: 'p1', processId: 1, timestamp: 0 });
    expect(msg.v).toBe(1);
    expect(msg.event).toBe('log.created');
    expect(msg.id).toBeTruthy();
    expect(typeof msg.ts).toBe('number');
  });

  it('parses valid frames and rejects junk', () => {
    const msg = createMessage('request.started', {
      requestId: 'r1',
      projectId: 'p1',
      method: 'GET',
      url: '/',
      headers: {},
      query: {},
      startedAt: 0,
    });
    expect(parseMessage(JSON.stringify(msg))?.event).toBe('request.started');
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(JSON.stringify({ event: 'unknown.event', payload: {} }))).toBeNull();
  });

  it('knows event names', () => {
    expect(isDevToolsEventName('request.completed')).toBe(true);
    expect(isDevToolsEventName('nope')).toBe(false);
  });
});

describe('editor urls', () => {
  it('builds vscode links per platform', () => {
    const posix = buildEditorUrl('vscode', { absolutePath: '/app/src/users.service.ts', line: 87, column: 21 }, () => 'linux');
    expect(posix).toBe('vscode://file/app/src/users.service.ts:87:21');

    const windows = buildEditorUrl('vscode', { absolutePath: 'C:\\app\\src\\users.service.ts', line: 1 }, () => 'win32');
    expect(windows).toBe('vscode://file/C:/app/src/users.service.ts:1:1');
  });

  it('builds cursor links', () => {
    expect(cursorUrl({ absolutePath: '/a/b.ts', line: 3, column: 4 })).toBe('cursor://file/a/b.ts:3:4');
    expect(vscodeUrl({ absolutePath: '/a/b.ts' })).toBe('vscode://file/a/b.ts:1:1');
  });

  it('returns null without a path', () => {
    expect(buildEditorUrl('vscode', {})).toBeNull();
  });
});
