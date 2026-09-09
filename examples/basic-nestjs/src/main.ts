import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestDevTools } from '@angelitosystems/nest-devtools';

/**
 * Basic NestJS example instrumented with DevTools.
 *
 * 1. terminal A: bun run dev            (from nest-devtools/packages/cli)
 * 2. terminal B: bun install && bun run dev   (here)
 * 3. open http://localhost:4317
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  NestDevTools.init(app, { project: 'basic-nestjs-example' });
  await app.listen(3001);

  new Logger('Example').log('HTTP server listening on http://localhost:3001');
  new Logger('Example').log('DevTools dashboard: http://localhost:4317');
}

void bootstrap();
