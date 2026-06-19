import { err } from '../../../common';
import { withProject } from '../../middleware/withProject';
import type { Command, CommandHandler } from '../../types';
import * as z from 'zod';

const schema = z.object({
  name: z.string(),
  description: z.string().optional(),
  runtimes: z.string().optional(),
  authorizerType: z.string().optional(),
  discoveryUrl: z.string().optional(),
  allowedAudience: z.string().optional(),
  allowedClients: z.string().optional(),
  allowedScopes: z.string().optional(),
  customClaims: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  semanticSearch: z.boolean().optional(),
  exceptionLevel: z.string().optional(),
  policyEngine: z.string().optional(),
  policyEngineMode: z.string().optional(),
  json: z.boolean().optional(),
});

const handler: CommandHandler<typeof schema> = async (context, input) => {
  if (!context.project) return err(new Error('missing project'));

  return context.project.config.add('gateways', input.name);
};

export const addGatewayCommand: Command<typeof schema> = {
  name: 'add.gateway',
  schema,
  handler,
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand
      .command('gateway')
      .description('Add an API gateway that routes requests to agent targets')
      .showHelpAfterError()
      .showSuggestionAfterError()
      .option('--name <name>', 'Gateway name [non-interactive]')
      .option('--description <description>', 'Gateway description [non-interactive]')
      .option('--runtimes <runtimes>', 'Comma-separated runtime names to expose through this gateway [non-interactive]')
      .option('--authorizer-type <type>', 'Authorizer type: NONE, AWS_IAM, or CUSTOM_JWT [non-interactive]')
      .option('--discovery-url <url>', 'OIDC discovery URL (for CUSTOM_JWT) [non-interactive]')
      .option('--allowed-audience <audience>', 'Comma-separated allowed audiences (for CUSTOM_JWT) [non-interactive]')
      .option('--allowed-clients <clients>', 'Comma-separated allowed client IDs (for CUSTOM_JWT) [non-interactive]')
      .option('--allowed-scopes <scopes>', 'Comma-separated allowed scopes (for CUSTOM_JWT) [non-interactive]')
      .option('--custom-claims <json>', 'Custom claim validations as JSON array (for CUSTOM_JWT) [non-interactive]')
      .option('--client-id <id>', 'OAuth client ID for fetching gateway bearer tokens [non-interactive]')
      .option('--client-secret <secret>', 'OAuth client secret for fetching gateway bearer tokens [non-interactive]')
      .option('--no-semantic-search', 'Disable semantic search for gateway target tool discovery [non-interactive]')
      .option(
        '--exception-level <level>',
        'Exception detail level in error responses: NONE, ALL [non-interactive]',
        'NONE'
      )
      .option('--policy-engine <name>', 'Policy engine name for Cedar-based authorization [non-interactive]')
      .option('--policy-engine-mode <mode>', 'Policy engine mode: LOG_ONLY or ENFORCE [non-interactive]')
      .option('--json', 'Output as JSON [non-interactive]'),
};
