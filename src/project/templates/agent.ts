import { agentFrameworkSchema, agentLanguageSchema, agentProtocolSchema, modelProviderSchema } from '../../schemas';
import { HandlebarsTemplateEngine, type TemplateHelper } from './handlebars';
import type { TemplateRenderer, TemplateRendererContext } from './types';
import { z } from 'zod';

const agentTemplateSchema = z.object({
  name: z.string(),
  agentName: z.string(),
  projectName: z.string(),
  language: agentLanguageSchema,
  framework: agentFrameworkSchema,
  protocol: agentProtocolSchema,
  modelProvider: modelProviderSchema,
  hasMemory: z.boolean(),
  hasGateway: z.boolean(),
  hasConfigBundle: z.boolean(),
});

export type AgentTemplateValues = z.infer<typeof agentTemplateSchema>;

const helpers: TemplateHelper[] = [
  { name: 'eq', fn: (a: unknown, b: unknown) => a === b },
  { name: 'includes', fn: (array: unknown[], value: unknown) => Array.isArray(array) && array.includes(value) },
  { name: 'snakeCase', fn: (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() },
  {
    name: 'pathSlug',
    fn: (str: string) =>
      str
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/^_+/, '')
        .replace(/_+/g, '_')
        .toLowerCase(),
  },
];

export function getAgentTemplateRenderer(context: TemplateRendererContext): TemplateRenderer<AgentTemplateValues> {
  return new HandlebarsTemplateEngine(context, agentTemplateSchema, helpers);
}
