import { getErrorMessage } from '../errors';
import { TelemetryClientAccessor } from './client-accessor.js';
import type { Command, CommandAttrs } from './schemas/command-run.js';

/**
 * Run a CLI command with telemetry, standardized error output, and process.exit.
 * The callback should throw on failure and return telemetry attrs on success.
 */
export async function cliCommandRun<C extends Command>(
  command: C,
  json: boolean,
  fn: () => Promise<CommandAttrs<C>>
): Promise<never> {
  try {
    const client = await TelemetryClientAccessor.get();
    await client.withCommandRun(command, fn);
    process.exit(0);
  } catch (error) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: getErrorMessage(error) }));
    } else {
      console.error(getErrorMessage(error));
    }
    process.exit(1);
  }
}
