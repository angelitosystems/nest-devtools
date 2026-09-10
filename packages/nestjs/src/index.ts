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
export type { InitResult, NestDevToolsOptions } from './sdk';
export { PluginManager } from './plugins';
export type { DevToolsPlugin, PluginContext } from './plugins';
export type { ProfileKind, ProfileResult } from '@angelitosystems/devtools-core';
export { captureError } from './instrumentation/exceptions';
export type { DevToolsUserConfig } from '@angelitosystems/devtools-core';
export { requestContext } from '@angelitosystems/devtools-core';
export type { RequestContext } from '@angelitosystems/devtools-core';
