/**
 * @angelitosystems/nest-devtools
 *
 * Drop-in real-time debugging and observability for NestJS.
 *
 * Usage:
 *   import { NestDevTools } from '@angelitosystems/nest-devtools';
 *   const app = await NestFactory.create(AppModule);
 *   NestDevTools.init(app);
 */
export { NestDevTools, devtools } from './sdk';
export type { InitResult } from './sdk';
export { captureError } from './instrumentation/exceptions';
export type { DevToolsUserConfig } from '@angelitosystems/devtools-core';
export { requestContext } from '@angelitosystems/devtools-core';
export type { RequestContext } from '@angelitosystems/devtools-core';
