import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import { NestFactory } from '@nestjs/core';
import { Controller, Get, Module } from '@nestjs/common';
import { NestDevTools } from '../src';

// ---------------------------------------------------------------------------
// trace collector: monkey-patch ws WebSocket.send to record outgoing frames
// ---------------------------------------------------------------------------
import { WebSocket as WsLib } from 'ws';

const sentFrames: string[] = [];
const OriginalWebSocket = WsLib as unknown as { WebSocket: typeof WebSocket };
const originalSend = (WsLib.WebSocket.prototype as unknown as { send: (...args: unknown[]) => unknown }).send;
(WsLib.WebSocket.prototype as unknown as { send: (...args: unknown[]) => unknown }).send = function (
  data: unknown,
  ...rest: unknown[]
) {
  try {
    sentFrames.push(String(data));
  } catch {
    /* ignore */
  }
  return originalSend.apply(this, [data, ...rest]);
};
void OriginalWebSocket;

// ---------------------------------------------------------------------------

@Controller()
class TraceController {
  @Get('/hello')
  hello(): { ok: boolean } {
    return { ok: true };
  }

  @Get('/boom')
  boom(): never {
    throw new Error('boom on purpose');
  }
}

@Module({ controllers: [TraceController] })
class TraceModule {}

describe('E2E trace', () => {
  it('traces which events leave the SDK during a live request', async () => {
    const app = await NestFactory.create(TraceModule, { logger: false });
    const init = NestDevTools.init(app, { enabled: true, server: 'ws://127.0.0.1:59998', project: 'trace-app' });
    console.log('init result:', JSON.stringify(init));

    await app.listen(3210);
    console.log('listening');

    await new Promise((resolve) => setTimeout(resolve, 400));
    const res = await fetch('http://localhost:3210/hello');
    console.log('/hello →', res.status);
    const res2 = await fetch('http://localhost:3210/boom');
    console.log('/boom →', res2.status);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const events = sentFrames
      .map((frame) => {
        try {
          return JSON.parse(frame).event as string;
        } catch {
          return 'unparsed';
        }
      })
      .filter((event) => event !== 'unparsed');

    const counts: Record<string, number> = {};
    for (const event of events) counts[event] = (counts[event] ?? 0) + 1;
    console.log('EVENTS SENT:', JSON.stringify(counts, null, 2));

    // Print the first request frame for inspection
    const firstRequest = sentFrames.find((frame) => frame.includes('request.completed'));
    console.log('first request frame:', firstRequest?.slice(0, 300) ?? 'NONE');

    expect(res.status).toBe(200);
    await app.close();
  }, 30000);
});
