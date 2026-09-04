import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { streamText } from 'ai';
import { z } from 'zod';
import { loadModel } from './model/load.js';

const SYSTEM_PROMPT = `You are a helpful assistant.`;

const requestSchema = z.object({
  prompt: z.string().default(''),
});

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema,
    async *process(payload) {
      const result = streamText({
        model: loadModel(),
        system: SYSTEM_PROMPT,
        prompt: payload.prompt,
      });

      for await (const chunk of result.textStream) {
        yield { data: chunk };
      }
    },
  },
});

app.run({ port: parseInt(process.env.PORT ?? '8080') });
