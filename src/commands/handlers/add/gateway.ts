import { err } from '../../../common';
import { withProject } from '../../middleware';
import type { Command, CommandFlags } from '../../types';
import z from 'zod';

const flags = {
  name: { schema: z.string(), usage: '--name <name>', description: 'Gateway name', required: true },
  description: { schema: z.string().optional(), usage: '--description <desc>', description: 'Gateway description' },
  runtimes: {
    schema: z.string().optional(),
    usage: '--runtimes <runtimes>',
    description: 'Comma-separated runtime names',
  },
  authorizerType: { schema: z.string().optional(), usage: '--authorizer-type <type>', description: 'Authorizer type' },
  discoveryUrl: { schema: z.string().optional(), usage: '--discovery-url <url>', description: 'OIDC discovery URL' },
  allowedAudience: {
    schema: z.string().optional(),
    usage: '--allowed-audience <audience>',
    description: 'Allowed audiences',
  },
  allowedClients: {
    schema: z.string().optional(),
    usage: '--allowed-clients <clients>',
    description: 'Allowed client IDs',
  },
  allowedScopes: { schema: z.string().optional(), usage: '--allowed-scopes <scopes>', description: 'Allowed scopes' },
  customClaims: {
    schema: z.string().optional(),
    usage: '--custom-claims <json>',
    description: 'Custom claim validations',
  },
  clientId: { schema: z.string().optional(), usage: '--client-id <id>', description: 'OAuth client ID' },
  clientSecret: {
    schema: z.string().optional(),
    usage: '--client-secret <secret>',
    description: 'OAuth client secret',
  },
  semanticSearch: {
    schema: z.boolean().optional(),
    usage: '--no-semantic-search',
    description: 'Disable semantic search',
  },
  exceptionLevel: {
    schema: z.string().optional(),
    usage: '--exception-level <level>',
    description: 'Exception detail level',
  },
  policyEngine: { schema: z.string().optional(), usage: '--policy-engine <name>', description: 'Policy engine name' },
  policyEngineMode: {
    schema: z.string().optional(),
    usage: '--policy-engine-mode <mode>',
    description: 'Policy engine mode',
  },
  json: { schema: z.boolean().optional(), usage: '--json', description: 'Output as JSON' },
} as const satisfies CommandFlags;

export const addGatewayCommand: Command<typeof flags> = {
  name: 'add.gateway',
  flags,
  handler: async (context, input) => {
    if (!context.project) return err(new Error('missing project'));
    return context.project.config.add('gateways', input.name);
  },
  middleware: [withProject],
  setup: (_context, parentCommand) =>
    parentCommand.command('gateway').description('Add a gateway to the project').showHelpAfterError(),
};
