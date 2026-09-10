import { INestApplication } from '@nestjs/common';
import { init, NestDevToolsOptions } from './init';

/**
 * Convenience namespace so users can write:
 *   NestDevTools.init(app)
 */
export const NestDevTools = {
  init,
};

export type { NestDevToolsOptions };
