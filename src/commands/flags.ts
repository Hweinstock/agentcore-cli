import type { CommandFlags } from './types';
import z from 'zod';

export const COMMON_FLAGS = {
  debug: {
    schema: z.boolean().optional(),
    usage: '--debug',
    description: 'enable debug logging',
  },
  json: {
    schema: z.boolean().optional(),
    usage: '--json',
    description: 'enable json structured output',
  },
} as const satisfies CommandFlags;

export const AGENT_FLAGS = {
  language: {
    schema: z.enum(['python', 'typescript']).optional(),
    usage: '--language <language>',
    description: 'Target language',
  },
  framework: {
    schema: z.enum(['strands', 'vercel', 'langchain_langgraph']).optional(),
    usage: '--framework <framework>',
    description: 'Agent framework',
  },
  protocol: {
    schema: z.enum(['http', 'mcp']).optional(),
    usage: '--protocol <protocol>',
    description: 'Protocol',
  },
  memory: {
    schema: z.enum(['none', 'longAndShort', 'short']).optional(),
    usage: '--memory <memory>',
    description: 'Memory type',
  },
  buildType: {
    schema: z.enum(['container', 'codezip']).optional(),
    usage: '--build-type <buildType>',
    description: 'Build type',
  },
} as const satisfies CommandFlags;

export const CONFIRMATION_FLAGS = {
  yes: { schema: z.boolean().optional(), usage: '-y, --yes', description: 'Skip confirmation prompt' },
} as const satisfies CommandFlags;
