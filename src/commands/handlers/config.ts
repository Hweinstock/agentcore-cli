import { ValidationError, err, ok, tryParseJson } from '../../common';
import { COMMON_FLAGS } from '../flags';
import type { Command, CommandArguments, CommandFlags } from '../types';
import z from 'zod';

const flags = {
  ...COMMON_FLAGS,
} as const satisfies CommandFlags;

const args = [
  { name: 'key', schema: z.string().optional(), description: 'Config key (dotted path)' },
  { name: 'value', schema: z.string().optional(), description: 'Value to set' },
] as const satisfies CommandArguments;

export const configCommand: Command<typeof flags, typeof args> = {
  name: 'config',
  flags,
  arguments: args,
  handler: async (context, input) => {
    const accessor = context.globalConfigAccessor;

    if (!input.key) {
      const configResult = await accessor.all();
      if (!configResult.success) return configResult;
      context.consoleLogger.info(JSON.stringify(configResult.data.config));
      return ok(configResult.data.config);
    }

    if (!accessor.isValidPath(input.key)) {
      return err(new ValidationError(`unknown config key: ${input.key}`));
    }

    if (!input.value) {
      const configResult = await accessor.get(input.key);
      if (!configResult.success) return configResult;
      context.consoleLogger.info(JSON.stringify(configResult.data.value));
      return ok(configResult.data.value);
    }

    // TS is not able to infer that this is always a string since the json string we pass in always resolves to a string.
    const inputValue = tryParseJson(input.value, input.value).data;
    if (!accessor.isValidPathValue(input.key, inputValue)) {
      return err(new ValidationError(`invalid value ${input.value} for ${input.key}. type=${typeof input.value}`));
    }
    const configResult = await accessor.set(input.key, inputValue);
    if (!configResult.success) return configResult;
    context.consoleLogger.info(`set ${input.key}=${input.value}`);
    return ok(configResult.data.value);
  },
  setup: (_context, parentCommand) =>
    parentCommand.command('config').description('Get or set configuration values').showHelpAfterError(),
};
