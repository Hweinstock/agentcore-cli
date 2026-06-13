import { getStreamableHttpMcpClient } from './mcp_client/client.js';
import { loadModel } from './model/load.js';
import { Agent, McpClient, type ToolList, tool } from '@strands-agents/sdk';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { z } from 'zod';

// Define a collection of MCP clients (filter out anything that failed to initialize)
const mcpClients: McpClient[] = [getStreamableHttpMcpClient()].filter((client): client is McpClient => Boolean(client));

// Define a collection of tools used by the model
const tools: ToolList = [];

// Define a simple function tool — the Zod schema gives us type inference and runtime validation for free
const addNumbers = tool({
  name: 'add_numbers',
  description: 'Return the sum of two numbers',
  inputSchema: z.object({
    a: z.number(),
    b: z.number(),
  }),
  callback: async ({ a, b }) => a + b,
});
tools.push(addNumbers);

// Add MCP clients to tools
tools.push(...mcpClients);

const SYSTEM_PROMPT = `
You are a helpful assistant. Use tools when appropriate.
`;

let cachedAgent: Agent | null = null;

async function getOrCreateAgent(): Promise<Agent> {
  if (!cachedAgent) {
    const model = await loadModel();
    cachedAgent = new Agent({
      model,
      systemPrompt: SYSTEM_PROMPT,
      tools,
    });
  }
  return cachedAgent;
}

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    async *process(payload: any, context: any) {
      const agent = await getOrCreateAgent();

      for await (const event of agent.stream(payload.prompt ?? '')) {
        if (
          event.type === 'modelStreamUpdateEvent' &&
          event.event?.type === 'modelContentBlockDeltaEvent' &&
          event.event.delta?.type === 'textDelta'
        ) {
          yield { data: event.event.delta.text };
        }
      }
    },
  },
});

app.run({ port: parseInt(process.env.PORT ?? '8080') });
