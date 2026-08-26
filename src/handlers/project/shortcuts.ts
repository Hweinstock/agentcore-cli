import {
  DEFAULT_EPISODIC_REFLECTION_NAMESPACE_TEMPLATES,
  DEFAULT_STRATEGY_NAMESPACE_TEMPLATES,
  type Memory,
} from "../../projectSchemas/memory";
import type { ScaffoldRuntimeInput } from "./types";

export const MEMORY_SHORTCUTS = {
  none: (_runtimeName: string) => undefined,
  short: (runtimeName: string): Memory => ({
    name: `${runtimeName}Memory`,
    eventExpiryDuration: 30,
    strategies: [],
  }),
  shortAndLongTerm: (runtimeName: string): Memory => ({
    name: `${runtimeName}Memory`,
    eventExpiryDuration: 30,
    strategies: (["SEMANTIC", "USER_PREFERENCE", "SUMMARIZATION", "EPISODIC"] as const).map(
      (type) => ({
        type,
        namespaceTemplates: DEFAULT_STRATEGY_NAMESPACE_TEMPLATES[type],
        ...(type === "EPISODIC" && {
          reflectionNamespaceTemplates: DEFAULT_EPISODIC_REFLECTION_NAMESPACE_TEMPLATES,
        }),
      }),
    ),
  }),
} satisfies Record<string, (runtimeName: string) => Memory | undefined>;

export type MemoryShortcutName = keyof typeof MEMORY_SHORTCUTS;

export const MEMORY_SHORTCUT_NAMES = Object.keys(MEMORY_SHORTCUTS) as unknown as readonly [
  MemoryShortcutName,
  ...MemoryShortcutName[],
];

type RuntimeTemplateShortcut = Omit<ScaffoldRuntimeInput, "memory"> & {
  memory?: MemoryShortcutName;
};

export const RUNTIME_TEMPLATE_SHORTCUTS = {
  "hello-world-python": {
    runtimeName: "hello_world",
    build: "CodeZip",
    language: "Python",
    framework: "none",
    modelProvider: "Bedrock",
    entrypoint: "main.py",
    runtimeVersion: "PYTHON_3_14",
  },
  "hello-world-python-container": {
    runtimeName: "hello_world",
    build: "Container",
    language: "Python",
    framework: "none",
    modelProvider: "Bedrock",
    entrypoint: "main.py",
  },
  "strands-python": {
    runtimeName: "strands_agent",
    build: "CodeZip",
    language: "Python",
    framework: "strands",
    modelProvider: "Bedrock",
    entrypoint: "main.py",
    runtimeVersion: "PYTHON_3_14",
    memory: "shortAndLongTerm",
  },
} as const satisfies Record<string, RuntimeTemplateShortcut>;

export type RuntimeTemplateShortcutName = keyof typeof RUNTIME_TEMPLATE_SHORTCUTS;

export const RUNTIME_TEMPLATE_SHORTCUT_NAMES = Object.keys(
  RUNTIME_TEMPLATE_SHORTCUTS,
) as unknown as readonly [RuntimeTemplateShortcutName, ...RuntimeTemplateShortcutName[]];

export function resolveRuntimeTemplateShortcut(
  name: RuntimeTemplateShortcutName,
  runtimeName: string = RUNTIME_TEMPLATE_SHORTCUTS[name].runtimeName,
): ScaffoldRuntimeInput {
  const selected: RuntimeTemplateShortcut = RUNTIME_TEMPLATE_SHORTCUTS[name];
  const { memory: memoryShortcut, ...shortcut } = selected;
  const memory = memoryShortcut ? MEMORY_SHORTCUTS[memoryShortcut](runtimeName) : undefined;
  return {
    ...shortcut,
    runtimeName,
    ...(memory && { memory }),
  };
}
