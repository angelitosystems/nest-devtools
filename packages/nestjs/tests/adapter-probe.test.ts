import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import { NestFactory } from '@nestjs/core';
import { Controller, Get, Module } from '@nestjs/common';

@Controller()
class ProbeController {
  @Get('/hello')
  hello(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('adapter probe', () => {
  it('prints adapter internals', async () => {
    const app = await NestFactory.create(ProbeModule, { logger: false });
    const adapter = app.getHttpAdapter();
    console.log('adapter type:', JSON.stringify(adapter.getType()));
    console.log('adapter keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(adapter)).slice(0, 20));
    const anyAdapter = adapter as unknown as Record<string, unknown>;
    console.log('has getHttpServer:', typeof anyAdapter['getHttpServer']);
    try {
      const server = (anyAdapter['getHttpServer'] as () => unknown)?.();
      console.log('server exists:', !!server);
      if (server) {
        console.log('server constructor:', (server as { constructor?: { name?: string } }).constructor?.name);
        console.log(
          'request listeners:',
          (server as { listeners?: (e: string) => unknown[] }).listeners?.('request').length,
        );
      }
    } catch (error) {
      console.log('getHttpServer threw:', (error as Error).message);
    }

    console.log('app has listen:', typeof app.listen);
    await app.close();
    expect(true).toBe(true);
  }, 15000);
});
