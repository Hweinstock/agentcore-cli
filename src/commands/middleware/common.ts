import type { Command, CommandArguments, CommandFlags } from '../types';

export const withLogging = <F extends CommandFlags, A extends CommandArguments>(
  command: Command<F, A>
): Command<F, A> => ({
  ...command,
  handler: async (context, input) => {
    const commandLogger = context.fileLogger.child({ command: command.name });

    commandLogger.info(`running command`);

    const commandResult = await command.handler({ ...context, fileLogger: commandLogger }, input);

    commandLogger.info(`exitting command with result=${JSON.stringify(commandResult)}`);

    return commandResult;
  },
});

export const withTelemetry = <F extends CommandFlags, A extends CommandArguments>(
  command: Command<F, A>
): Command<F, A> => ({
  ...command,
  handler: (context, input) =>
    context.telemetryClient.withMetric('cli.command_run', {}, recorder =>
      command.handler({ ...context, telemetryRecorder: recorder }, input)
    ),
});
