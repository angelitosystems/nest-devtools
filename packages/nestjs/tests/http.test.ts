import { describe, expect, it } from 'bun:test';
import { clientIp, parseQuery, safeUrlPath } from '../src/instrumentation/http';

describe('http helpers', () => {
  it('splits url and query', () => {
    expect(safeUrlPath('/users?page=2&size=10')).toBe('/users');
    expect(parseQuery('/users?page=2&size=10')).toEqual({ page: '2', size: '10' });
    expect(parseQuery('/users')).toEqual({});
  });

  it('extracts client ip', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: { remoteAddress: '9.9.9.9' } } as never)).toBe('1.2.3.4');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } } as never)).toBe('127.0.0.1');
  });
});
