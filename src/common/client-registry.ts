import type { Logger } from '../logging';
import { type Result, err, ok } from './result';

interface ClientRegistryContext {
  logger: Logger;
}

interface StreamRequestOptions {
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

interface HttpClient {
  postStream: (options: StreamRequestOptions) => Promise<Result<AsyncIterable<string>>>;
}

export interface ClientRegistry {
  getHttpClient: () => HttpClient;
}

export const getClientRegistry = (_context: ClientRegistryContext): ClientRegistry => ({
  // TODO: memoize this
  getHttpClient: () => ({
    postStream: async options => {
      try {
        const response = await fetch(options.url, { method: 'POST', headers: options.headers, body: options.body });
        if (!response.body) return err(new Error('No response body'));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const stream: AsyncIterable<string> = {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                const result = await reader.read();
                if (result.done) return { done: true as const, value: undefined };
                return { done: false as const, value: decoder.decode(result.value as Uint8Array) };
              },
            };
          },
        };

        return ok(stream);
      } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
      }
    },
  }),
});
