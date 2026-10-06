import { join } from "node:path";
import z from "zod";
import { createInspectorHandler } from "../../../core/dev/inspector/server";
import type { InspectorDeps } from "../../../core/dev/inspector/types";
import { rewriteOtelEndpointForContainer } from "../../../core/dev/otel/collector";
import { findFreePort, resolveDevPort, resolveDevPorts } from "../../../core/dev/port";
import { projectSpecPath } from "../../../core/project/fsUtils";
import { DevSupervisor, type SupervisorConfig } from "../../../core/dev/supervisor";
import type { ProjectRuntime } from "../../../projectSchemas/runtime";
import {
  AgentCoreCLIError,
  ERROR_SOURCE,
  InputValidationError,
  NotImplementedError,
  ResourceNotFoundError,
  SilentCLIError,
} from "../../../errors";
import type { AppIO, BrowserOpener, FileWatcher, PortChecker, startHttpServer } from "../../../io";
import { withUserCancellation } from "../../../runnable";
import { createHandler, flag, ProjectKey, type Middleware } from "../../../router";
import { JsonRendererKey, type JsonRenderer } from "../../../tui";
import { JsonKey, RegionKey } from "../../keys";
import { assertMutuallyExclusiveFlags } from "../../utils";
import type { Project, ProjectManager } from "../types";
import { BMA_TEMPLATE_NAME, isBmaRuntime } from "../bma";
import type { DevEnvironmentLoader } from "./environment";
import type { DevAgent, DevEvent, DevTraceCollector, DevTraceCollectorStarter } from "./types";

/** The Inspector UI binds 8081 or, when that is taken, the next free port. */
const UI_DEFAULT_PORT = 8081;

export type DevProjectHandlerConfig = {
  io: AppIO;
  middlewares?: Middleware[];
  runners: SupervisorConfig["runners"];
  loadDevEnvironment: DevEnvironmentLoader;
  checkPort: PortChecker;
  startTraceCollector: DevTraceCollectorStarter;
  startServer: typeof startHttpServer;
  openBrowser: BrowserOpener;
  inspectorAssets: InspectorDeps["assets"];
  /** Whether the command runs on an interactive terminal (gates browser auto-open). */
  isInteractive: () => boolean;
  /** Watches agentcore.json so the Inspector reflects config edits live. */
  watchFile: FileWatcher;
  /** Re-resolves the project after a config change to pick up runtime edits. */
  projectManager: Pick<ProjectManager, "resolve">;
  /** Overrides how the supervisor decides an agent is ready (defaults to a real TCP poll). */
  waitReady?: SupervisorConfig["waitReady"];
};

/** Env for a spawned agent so its OTEL SDK reports to the collector as this runtime. */
function otelEnvForRuntime(
  collector: DevTraceCollector,
  runtime: DevAgent,
): Record<string, string> {
  const env = { ...collector.envVars, OTEL_SERVICE_NAME: runtime.name };
  return runtime.build === "CodeZip" ? env : rewriteOtelEndpointForContainer(env);
}

function supportsLocalDev(runtime: ProjectRuntime): boolean {
  return !isBmaRuntime(runtime);
}

function selectRuntimes(
  project: Project,
  {
    name,
    harness,
    port,
    mode,
    io,
    json,
  }: {
    name: string | undefined;
    harness: string | undefined;
    port: number | undefined;
    mode: "browser" | "headless";
    io: AppIO;
    json: JsonRenderer | undefined;
  },
): DevAgent[] {
  if (
    mode === "browser" &&
    (harness !== undefined ||
      (project.spec.runtimes.length === 0 && !name && project.spec.harnesses.length > 0))
  ) {
    throw new NotImplementedError("The Agent Inspector does not support harnesses yet.", {
      source: ERROR_SOURCE.USER,
    });
  }
  const harnesses = project.spec.harnesses
    .filter((candidate) => (harness ? candidate.name === harness : !name && mode === "headless"))
    .map((candidate): DevAgent => ({ name: candidate.name, build: "Harness" }));
  if (harness !== undefined) {
    if (harnesses.length > 0) return harnesses;
    const available = project.spec.harnesses.map((candidate) => candidate.name).join(", ");
    throw new ResourceNotFoundError(
      `Harness '${harness}' was not found. Available harnesses: ${available || "none"}.`,
    );
  }
  if (project.spec.runtimes.length === 0 && harnesses.length === 0) {
    throw new InputValidationError(
      "This project has no runtimes. Add a runtime to agentcore/agentcore.json and retry.",
    );
  }
  const selectedRuntimes = name
    ? project.spec.runtimes.filter((runtime) => runtime.name === name)
    : project.spec.runtimes;
  if (name && selectedRuntimes.length === 0) {
    const available = project.spec.runtimes.map((candidate) => candidate.name).join(", ");
    throw new ResourceNotFoundError(
      `Runtime '${name}' was not found. Available runtimes: ${available}.`,
    );
  }
  const supportedRuntimes = selectedRuntimes.filter(supportsLocalDev);
  if (supportedRuntimes.length === 0 && harnesses.length === 0) {
    throw new NotImplementedError(
      `Local dev is not supported for runtime '${selectedRuntimes[0]!.name}' (${BMA_TEMPLATE_NAME}). ` +
        "Run agentcore deploy, then use client.py to connect through Bedrock Managed Agents.",
      { source: ERROR_SOURCE.USER },
    );
  }
  if (supportedRuntimes.length + harnesses.length > 1 && port !== undefined) {
    throw new InputValidationError(
      `--port applies to a single runtime. Use ${project.spec.harnesses.length ? "--agent or --harness" : "--agent"} to select one.`,
    );
  }
  if (!name && mode === "browser") {
    for (const { name: harnessName } of project.spec.harnesses) {
      renderStatus(
        io,
        `Skipping harness '${harnessName}': the Agent Inspector does not support harnesses yet.`,
        json,
      );
    }
  }
  if (!name) {
    for (const runtime of selectedRuntimes.filter((runtime) => !supportsLocalDev(runtime))) {
      renderStatus(
        io,
        `Skipping runtime '${runtime.name}': local dev is not supported for ${BMA_TEMPLATE_NAME}.`,
        json,
      );
    }
  }
  return [...supportedRuntimes, ...harnesses];
}

/** An agent's own output, always tagged with the agent that produced it. */
function renderAgentEvent(io: AppIO, event: DevEvent, agent: string, json?: JsonRenderer): void {
  if (json) {
    json.renderJsonLine({ agent, ...event });
    return;
  }

  const output = event.type === "stdout" ? io.stdout : io.stderr;
  const line = event.type === "status" ? event.message : event.line;
  output.write(`[${agent}] ${line}\n`);
}

/** A command-level status line, not attributed to any agent. */
function renderStatus(io: AppIO, message: string, json?: JsonRenderer): void {
  if (json) {
    json.renderJsonLine({ type: "status", message });
    return;
  }
  io.stderr.write(`${message}\n`);
}

async function startTraceCollector(
  config: DevProjectHandlerConfig,
  project: Project,
  runtimes: DevAgent[],
  json?: JsonRenderer,
): Promise<DevTraceCollector> {
  const tracesDirectory = join(project.rootPath, "agentcore", ".cli", "traces", "otlp");
  let tracePersistErrorReported = false;
  const collector = await config.startTraceCollector({
    tracesDirectory,
    // A container reaches the collector over the host bridge, which a
    // 127.0.0.1 bind refuses, so bind all interfaces when any runtime is
    // a container.
    host: runtimes.some((runtime) => runtime.build !== "CodeZip") ? "0.0.0.0" : "127.0.0.1",
    // Persistence can fail after startup (disk, permissions). Warn once —
    // exports are still acked, so without this the loss would be silent.
    onError: (error) => {
      if (tracePersistErrorReported) return;
      tracePersistErrorReported = true;
      const detail = error instanceof Error ? error.message : String(error);
      renderStatus(
        config.io,
        `Warning: failed to persist traces to ${tracesDirectory} (${detail}); collected traces may be incomplete.`,
        json,
      );
    },
  });
  renderStatus(
    config.io,
    `OTEL collector listening on port ${collector.port}; traces persist to ${tracesDirectory}.`,
    json,
  );
  return collector;
}

function createDevEnvironmentResolver(
  loadDevEnvironment: DevEnvironmentLoader,
  projectRoot: string,
  region: string | undefined,
  collector: DevTraceCollector | undefined,
): (runtime: DevAgent) => Promise<Record<string, string>> {
  return async (runtime) => {
    const { env } = await loadDevEnvironment({ projectRoot, runtime, region });
    const otel =
      collector && (runtime.instrumentation?.enableOtel ?? true)
        ? otelEnvForRuntime(collector, runtime)
        : {};
    return { ...env, ...otel };
  };
}

export const createDevProjectHandler = (config: DevProjectHandlerConfig) =>
  createHandler({
    name: "dev",
    description: "run the project locally for development",
    middlewares: config.middlewares,
    flags: [
      flag("agent", "Runtime to run", z.string().optional()),
      flag("harness", "Harness to run", z.string().optional()),
      flag(
        "port",
        "port for the development server",
        z.coerce.number().int().min(1).max(65535).optional(),
      ),
      flag("traces", "disable local OTEL trace collection", z.boolean().default(true)),
      flag(
        "mode",
        "how to run: browser (Agent Inspector web UI) or headless (agents stream to the terminal)",
        z.enum(["browser", "headless"]).default("headless"),
      ),
      flag(
        "ui-port",
        "port for the Agent Inspector web UI (browser mode)",
        z.coerce.number().int().min(1).max(65535).optional(),
      ),
    ],
    handle: async (ctx, flags) => {
      const json = ctx.require(JsonKey) ? ctx.require(JsonRendererKey) : undefined;
      const project = ctx.require(ProjectKey);
      const region = ctx.require(RegionKey);
      assertMutuallyExclusiveFlags(flags, ["agent", "harness"]);
      const selectedAgent = flags.agent ?? flags.harness;
      await withUserCancellation(
        async (signal) => {
          let collector: DevTraceCollector | undefined;
          try {
            const runtimes = selectRuntimes(project, {
              name: flags.agent,
              harness: flags.harness,
              port: flags.port,
              mode: flags.mode,
              io: config.io,
              json,
            });
            if (
              flags.traces &&
              runtimes.some((runtime) => runtime.instrumentation?.enableOtel ?? true)
            ) {
              collector = await startTraceCollector(config, project, runtimes, json);
            }
            signal.throwIfAborted();

            const getDevEnvVarsForRuntime = createDevEnvironmentResolver(
              config.loadDevEnvironment,
              project.rootPath,
              region,
              collector,
            );

            const assignedPorts =
              flags.mode === "headless" && !selectedAgent
                ? await resolveDevPorts(runtimes, flags.port, config.checkPort, signal)
                : undefined;
            const supervisor = new DevSupervisor({
              runtimes,
              projectRoot: project.rootPath,
              runners: config.runners,
              getDevEnvVarsForRuntime,
              // Runtime selection rejects an explicit port for multiple runtimes.
              resolvePort: async (runtime) => {
                if (assignedPorts) {
                  const assignedPort = assignedPorts.get(runtime.name);
                  if (assignedPort === undefined) {
                    throw new AgentCoreCLIError(
                      `No port was assigned to runtime '${runtime.name}'.`,
                    );
                  }
                  return assignedPort;
                }
                const resolved = await resolveDevPort(
                  runtime.protocol,
                  flags.port,
                  config.checkPort,
                  signal,
                );
                if (
                  flags.mode === "headless" &&
                  selectedAgent &&
                  resolved.port !== resolved.requestedPort
                ) {
                  renderStatus(
                    config.io,
                    `Port ${resolved.requestedPort} is in use; using ${resolved.port}.`,
                    json,
                  );
                }
                return resolved.port;
              },
              waitReady: config.waitReady,
              signal,
            });

            if (flags.mode === "headless") {
              void Promise.allSettled(runtimes.map((runtime) => supervisor.start(runtime.name)));
              for await (const { agentName, event } of supervisor.events()) {
                const message = event.type === "status" ? event.message : undefined;
                const lifecycleStatus =
                  selectedAgent !== undefined &&
                  (message === `Agent '${agentName}' stopped.` ||
                    message?.startsWith(`Agent '${agentName}' is running on port `) ||
                    message?.startsWith(`Agent '${agentName}' failed to start: `) ||
                    message?.startsWith(`Agent '${agentName}' crashed: `));
                if (!lifecycleStatus) renderAgentEvent(config.io, event, agentName, json);
                const phases = supervisor.snapshot();
                if (phases.every(({ phase }) => phase !== "starting" && phase !== "running")) {
                  if (phases.some(({ phase }) => phase === "failed")) {
                    const error = selectedAgent
                      ? supervisor.snapshot().find(({ name }) => name === selectedAgent)?.error
                      : undefined;
                    if (error !== undefined) throw error;
                    throw new SilentCLIError();
                  }
                  break;
                }
              }
              signal.throwIfAborted();
              return;
            }

            const uiPort = (
              await findFreePort(UI_DEFAULT_PORT, flags["ui-port"], config.checkPort, signal)
            ).port;
            const server = await config.startServer(
              createInspectorHandler({
                supervisor,
                traces: collector?.traces,
                assets: config.inspectorAssets,
                project,
                selectedAgent: flags.agent,
              }),
              { port: uiPort, signal },
            );

            const onConfigChange = async () => {
              try {
                const reloaded = await config.projectManager.resolve({
                  filePath: project.rootPath,
                });
                if (!reloaded) return;
                const runtimes = reloaded.spec.runtimes.filter(supportsLocalDev);
                supervisor.setRuntimes(
                  flags.agent
                    ? runtimes.filter((runtime) => runtime.name === flags.agent)
                    : runtimes,
                );
                renderStatus(config.io, "Reloaded agents from agentcore.json.", json);
              } catch {
                // A half-saved config parses on the next change event.
              }
            };
            config.watchFile(
              projectSpecPath(project.rootPath),
              () => void onConfigChange(),
              signal,
            );

            const url = `http://127.0.0.1:${server.port}`;
            renderStatus(config.io, `Agent Inspector running at ${url}`, json);
            if (config.isInteractive() && !json) await config.openBrowser(url);

            for await (const { agentName, event } of supervisor.events()) {
              renderAgentEvent(config.io, event, agentName, json);
            }
            signal.throwIfAborted();
          } finally {
            // Close only after the runner returns, which is after the child's own
            // shutdown grace, so the agent's final spans still reach the collector.
            await collector?.close();
          }
        },
        { onCancel: () => config.io.stderr.write("Shutting down…\n") },
      );
    },
  });
