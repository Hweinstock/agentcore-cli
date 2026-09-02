import type { FsTreeNode } from "./fsTree";
import type { ProjectRuntime } from "../../../projectSchemas/runtime";
import type { MemorySchema } from "../../../projectSchemas/memory";
import type { CredentialSchema } from "../../../projectSchemas/credential";
import type { HarnessRegistryEntry } from "../../../projectSchemas/harness";
import type { Evaluator } from "../../../projectSchemas/evaluator";
import type { EnvLocalEntry } from "../../../handlers/project/types";
import type z from "zod";

/** AgentCore Project Spec Entries that rendered as part of a {@link Template} **/
export type SpecEntries = {
  runtimes?: ProjectRuntime[];
  credentials?: z.infer<typeof CredentialSchema>[];
  memories?: z.infer<typeof MemorySchema>[];
  harnesses?: HarnessRegistryEntry[];
  evaluators?: Evaluator[];
};

/** Combines several {@link SpecEntries} into one, concatenating each resource collection. */
export function mergeSpecEntries(entries: SpecEntries[]): SpecEntries {
  const runtimes = entries.flatMap(({ runtimes }) => runtimes ?? []);
  const credentials = entries.flatMap(({ credentials }) => credentials ?? []);
  const memories = entries.flatMap(({ memories }) => memories ?? []);
  const harnesses = entries.flatMap(({ harnesses }) => harnesses ?? []);

  return {
    ...(runtimes.length > 0 && { runtimes }),
    ...(credentials.length > 0 && { credentials }),
    ...(memories.length > 0 && { memories }),
    ...(harnesses.length > 0 && { harnesses }),
  };
}

/** A group of files and resources that can be rendered into a project **/
export type Template = {
  tree: FsTreeNode;
  spec: SpecEntries;
  /** Secret material for agentcore/.env.local (e.g. a model provider API key). */
  envEntries?: EnvLocalEntry[];
};

/** A standard interface for resolving templates from a given input of paramters **/
export interface TemplateResolver<T> {
  resolve(input: T): Promise<Template>;
}

/** An interface for rendering templates by substituing placeholders across a templatedString **/
export interface TemplateRenderer {
  render(templatedString: string, context: Record<string, unknown>): string;
}
