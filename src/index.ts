#!/usr/bin/env node
import { main } from './cli';

function handleError(err: unknown) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

// Global safety net — prevent raw stack traces from reaching the user
process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

main(process.argv).catch(handleError);
