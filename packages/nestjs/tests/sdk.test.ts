import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import { NestFactory } from '@nestjs/core';
import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestDevTools } from '../src';
import { captureError } from '../src/instrumentation/exceptions';

describe('NestDevTools SDK', () => {
  it('is a no-op when disabled', () => {
    const result = NestDevTools.init({} as never, { enabled: false });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe('disabled-by-config');
    expect(NestDevTools.isActive()).toBe(false);
  });

  it('captures console + errors + requests from a real NestJS app', async () => {
    @Controller()
    class TestController {
      @Get('/ok')
      ok(): { ok: boolean } {
        console.info('serving /ok');
        return { ok: true };
      }

      @Get('/boom')
      boom(): never {
        throw new Error('boom on purpose');
      }
    }

    @Module({ controllers: [TestController] })
    class TestModule {}

    const app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    const url = `http://localhost:${address.port}`;

    const result = NestDevTools.init(app as NestExpressApplication, {
      enabled: true,
      server: 'ws://localhost:59999',
      project: 'sdk-test',
    });
    expect(result.enabled).toBe(true);

    const okRes = await fetch(`${url}/ok`);
    expect(okRes.status).toBe(200);

    const boomRes = await fetch(`${url}/boom`);
    expect(boomRes.status).toBe(500);

    // Allow a beat for async instrumentation to settle.
    await new Promise((resolve) => setTimeout(resolve, 150));

    NestDevTools.destroy();
    await app.close();
  }, 20000);

  it('captureError works outside of requests', () => {
    captureError(new Error('manual error'), { context: 'test' });
  });
});
