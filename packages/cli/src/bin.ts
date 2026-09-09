#!/usr/bin/env bun
import { main } from './cli';

main(process.argv.slice(2))
  .then((code) => {
    if (code !== 0 && code !== undefined) process.exitCode = code;
  })
  .catch((error) => {
    console.error('nest-devtools failed:', error);
    process.exitCode = 1;
  });
