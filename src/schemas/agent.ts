import { z } from 'zod';

export const agentLanguageSchema = z.enum(['python', 'typescript']);
export const agentFrameworkSchema = z.enum(['strands', 'vercel', 'langchain_langgraph']);
export const agentProtocolSchema = z.enum(['http', 'mcp']);
export const agentMemorySchema = z.enum(['none', 'longAndShort', 'short']);
export const agentBuildTypeSchema = z.enum(['container', 'codezip']);
export const modelProviderSchema = z.enum(['Bedrock', 'Anthropic', 'OpenAI', 'Gemini']);

export type AgentLanguage = z.infer<typeof agentLanguageSchema>;
export type AgentFramework = z.infer<typeof agentFrameworkSchema>;
export type AgentProtocol = z.infer<typeof agentProtocolSchema>;
export type AgentMemory = z.infer<typeof agentMemorySchema>;
export type AgentBuildType = z.infer<typeof agentBuildTypeSchema>;
export type ModelProvider = z.infer<typeof modelProviderSchema>;
