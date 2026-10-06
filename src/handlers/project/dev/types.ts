import type { InspectorTraces } from "../../../core/dev/inspector/types";
import type { ProjectRuntime } from "../../../projectSchemas/runtime";

export type DevEvent =
  | { type: "status"; message: string }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string };

/** A project harness, run from the public harness image over the HTTP protocol. */
export type DevHarness = Pick<
  ProjectRuntime,
  "name" | "protocol" | "instrumentation" | "envVars"
> & {
  build: "Harness";
};

export type DevAgent = ProjectRuntime | DevHarness;

export type DevServerInput<Agent extends DevAgent = ProjectRuntime> = {
  runtime: Agent;
  projectRoot: string;
  port: number;
  env?: Record<string, string>;
  signal: AbortSignal;
};

export interface DevRunner<Agent extends DevAgent = ProjectRuntime> {
  run(input: DevServerInput<Agent>): AsyncGenerator<DevEvent, void>;
}

/** A local OTLP receiver that spawned agents export traces to. */
export interface DevTraceCollector {
  port: number;
  /** Environment variables that point an agent's OTEL SDK at the receiver. */
  envVars: Record<string, string>;
  /** The trace reads the Inspector serves, without exposing the store itself. */
  traces: InspectorTraces;
  close(): Promise<void>;
}

export type DevTraceCollectorStarter = (options: {
  tracesDirectory: string;
  /** Address to bind. Defaults to 127.0.0.1; 0.0.0.0 lets a container reach it. */
  host?: string;
  /** Reports a trace-persistence failure (the export is still acked to stop retries). */
  onError?: (error: unknown) => void;
}) => Promise<DevTraceCollector>;
