import { ResourceNotFoundError } from "../../errors";
import { waitForPort } from "../../io";
import type { DevEvent, DevRunner } from "../../handlers/project/dev/types";
import type { ProjectRuntime } from "../../projectSchemas/runtime";

export type AgentPhase = "idle" | "starting" | "running" | "failed";

export interface AgentStatus {
  name: string;
  buildType: ProjectRuntime["build"];
  protocol: NonNullable<ProjectRuntime["protocol"]>;
  phase: AgentPhase;
  port?: number;
  error?: Error;
}

/** A dev event tagged with the name of the runtime that produced it. */
export interface SupervisedEvent {
  agentName: string;
  event: DevEvent;
}

export type SupervisorConfig = {
  runtimes: ProjectRuntime[];
  projectRoot: string;
  runners: { CodeZip: DevRunner; Container: DevRunner };
  /** Resolves the full child environment for a runtime (dev env + OTEL vars). */
  getDevEnvVarsForRuntime: (runtime: ProjectRuntime) => Promise<Record<string, string>>;
  /** Resolves the port a runtime should serve on. */
  resolvePort: (runtime: ProjectRuntime) => Promise<number>;
  /**
   * Resolves once a started agent accepts connections on its port. `lastActivityAt`
   * returns the time of the agent's most recent output, so a build that keeps
   * logging is not timed out mid-flight.
   */
  waitReady?: (port: number, signal: AbortSignal, lastActivityAt: () => number) => Promise<void>;
  signal: AbortSignal;
};

type AgentEntry = {
  runtime: ProjectRuntime;
  phase: AgentPhase;
  port?: number;
  error?: Error;
  completed?: boolean;
  starting?: Promise<{ name: string; port: number }>;
  /** The running child's pump, so shutdown can await its final spans. */
  running?: Promise<void>;
  /** A reloaded definition held for a live agent, applied on its next start. */
  pendingRuntime?: ProjectRuntime;
};

/**
 * Owns the lifecycle of dev runtimes: agents can start lazily from the Inspector
 * or eagerly in headless mode. Each runs in its own abort scope chained off the
 * command's signal, and runner events merge into one attributed stream. Restart-
 * on-edit stays inside the child (uvicorn --reload / tsx watch).
 */
export class DevSupervisor {
  private readonly agents = new Map<string, AgentEntry>();
  private readonly queue: SupervisedEvent[] = [];
  private wake: (() => void) | undefined;
  private readonly waitReady: (
    port: number,
    signal: AbortSignal,
    lastActivityAt: () => number,
  ) => Promise<void>;

  constructor(private readonly config: SupervisorConfig) {
    for (const runtime of config.runtimes) {
      this.agents.set(runtime.name, { runtime, phase: "idle" });
    }
    this.waitReady = config.waitReady ?? waitForPort;
    config.signal.addEventListener("abort", () => this.wake?.(), { once: true });
  }

  /**
   * Replace the managed runtime set after a config change: new runtimes join
   * idle, edited definitions apply on the next start, and removed runtimes
   * drop unless they are currently starting or running.
   */
  public setRuntimes(runtimes: ProjectRuntime[]): void {
    const names = new Set(runtimes.map((runtime) => runtime.name));
    for (const runtime of runtimes) {
      const existing = this.agents.get(runtime.name);
      if (!existing) {
        this.agents.set(runtime.name, { runtime, phase: "idle" });
      } else if (existing.phase === "running" || existing.phase === "starting") {
        // A live process keeps its current definition; the edit applies on next
        // start, so the Inspector never proxies a running agent with stale metadata.
        existing.pendingRuntime = runtime;
      } else {
        existing.runtime = runtime;
      }
    }
    for (const [name, entry] of this.agents) {
      if (!names.has(name) && entry.phase !== "running" && entry.phase !== "starting") {
        this.agents.delete(name);
      }
    }
  }

  /** Current phase, port, and last error of every managed agent. */
  public snapshot(): AgentStatus[] {
    return [...this.agents.values()].map(({ runtime, phase, port, error }) => ({
      name: runtime.name,
      buildType: runtime.build,
      protocol: runtime.protocol ?? "HTTP",
      phase,
      port,
      error,
    }));
  }

  /** The port and protocol of a running agent, for proxying requests to it. */
  public running(
    name: string,
  ): { port: number; protocol: NonNullable<ProjectRuntime["protocol"]> } | undefined {
    const entry = this.agents.get(name);
    if (entry?.phase !== "running" || entry.port === undefined) return undefined;
    return { port: entry.port, protocol: entry.runtime.protocol ?? "HTTP" };
  }

  /**
   * Start an agent by name, resolving once it accepts connections. Concurrent
   * and repeated starts of the same agent share one attempt; a previously
   * failed agent may be started again.
   */
  public async start(name: string): Promise<{ name: string; port: number }> {
    const entry = this.agents.get(name);
    if (!entry) {
      const available = [...this.agents.keys()].join(", ");
      throw new ResourceNotFoundError(
        `Agent '${name}' was not found. Available agents: ${available}.`,
      );
    }
    if (entry.phase === "running" && entry.port !== undefined) {
      return { name, port: entry.port };
    }
    if (entry.starting) return entry.starting;

    if (entry.pendingRuntime) {
      entry.runtime = entry.pendingRuntime;
      entry.pendingRuntime = undefined;
    }
    entry.starting = this.launch(entry).finally(() => {
      entry.starting = undefined;
    });
    return entry.starting;
  }

  /**
   * The merged event stream of every agent this supervisor has started. Ends
   * when the supervisor's signal aborts and all pending events are drained.
   * Headless consumers can also finish after every agent stops.
   */
  public async *events(
    options: { untilStopped?: boolean } = {},
  ): AsyncGenerator<SupervisedEvent, void> {
    while (true) {
      for (const event of this.queue.splice(0)) yield event;
      if (this.config.signal.aborted) {
        // Let every live child finish shutting down so its final spans reach the
        // collector before the caller closes it, then drain what they emitted.
        const pending = [...this.agents.values()]
          .flatMap((entry) => [entry.starting, entry.running])
          .filter(Boolean);
        await Promise.allSettled(pending);
        for (const event of this.queue.splice(0)) yield event;
        return;
      }
      if (
        options.untilStopped &&
        [...this.agents.values()].every(({ phase }) => phase !== "starting" && phase !== "running")
      ) {
        if (this.queue.length > 0) continue;
        return;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        // A push during the yields above ran while wake was undefined, so its
        // wake was a no-op. Re-check now that wake is installed, so a queued
        // event resolves immediately instead of waiting for the next push.
        if (this.queue.length > 0) resolve();
      });
      this.wake = undefined;
    }
  }

  private push(agentName: string, event: DevEvent): void {
    this.queue.push({ agentName, event });
    this.wake?.();
  }

  private async launch(entry: AgentEntry): Promise<{ name: string; port: number }> {
    const name = entry.runtime.name;
    entry.phase = "starting";
    delete entry.error;
    entry.completed = false;

    const controller = new AbortController();
    const onParentAbort = () => controller.abort(this.config.signal.reason);
    // Chained for the agent's whole lifetime (not just startup): the command's
    // Ctrl-C must tear down every running child. The pump removes it on exit.
    if (this.config.signal.aborted) onParentAbort();
    else this.config.signal.addEventListener("abort", onParentAbort, { once: true });
    const unchain = () => this.config.signal.removeEventListener("abort", onParentAbort);

    try {
      controller.signal.throwIfAborted();
      const port = await this.config.resolvePort(entry.runtime);
      controller.signal.throwIfAborted();
      const env = await this.config.getDevEnvVarsForRuntime(entry.runtime);
      controller.signal.throwIfAborted();
      const runner = this.config.runners[entry.runtime.build];

      let ready = false;
      const activity = { at: Date.now() };
      const readiness = this.waitReady(port, controller.signal, () => activity.at).then(() => {
        ready = true;
      });
      const pump = this.pump(entry, runner, { port, env, signal: controller.signal }, () => {
        activity.at = Date.now();
      });
      entry.running = pump;
      const earlyExit = pump.finally(unchain).then(() => {
        if (!ready) {
          if (entry.error) throw entry.error;
          throw new Error(`Agent '${name}' exited before it became ready.`);
        }
      });
      // Both branches outlive the race (the pump runs for the agent's lifetime);
      // swallow their late rejections so losing branches never become unhandled.
      readiness.catch(() => {});
      earlyExit.catch(() => {});
      await Promise.race([readiness, earlyExit]);
      if (entry.error) throw entry.error;

      if (entry.completed) {
        entry.phase = "idle";
        entry.port = undefined;
        this.push(name, { type: "status", message: `Agent '${name}' stopped.` });
        return { name, port };
      }

      entry.phase = "running";
      entry.port = port;
      this.push(name, { type: "status", message: `Agent '${name}' is running on port ${port}.` });
      return { name, port };
    } catch (error) {
      controller.abort();
      unchain(); // idempotent alongside the pump's cleanup; covers setup failures before the pump exists
      await entry.running;
      entry.phase = "failed";
      const agentError =
        error instanceof Error ? error : new Error(String(error), { cause: error });
      entry.error = agentError;
      this.push(name, {
        type: "status",
        message: `Agent '${name}' failed to start: ${agentError.message}`,
      });
      throw error;
    }
  }

  /** Drives one runner generator, attributing its events; resolves when the runner ends. */
  private async pump(
    entry: AgentEntry,
    runner: DevRunner,
    input: { port: number; env: Record<string, string>; signal: AbortSignal },
    onActivity: () => void,
  ): Promise<void> {
    const name = entry.runtime.name;
    try {
      for await (const event of runner.run({
        runtime: entry.runtime,
        projectRoot: this.config.projectRoot,
        port: input.port,
        env: input.env,
        signal: input.signal,
      })) {
        onActivity();
        this.push(name, event);
      }
      if (entry.phase === "running") {
        entry.phase = "idle";
        entry.port = undefined;
        this.push(name, { type: "status", message: `Agent '${name}' stopped.` });
      } else if (entry.phase === "starting") {
        entry.completed = true;
      }
    } catch (error) {
      /** The runner rejects with the abort reason on teardown, which is a stop, not a crash. */
      if (input.signal.aborted) {
        if (entry.phase === "running") {
          entry.phase = "idle";
          entry.port = undefined;
          this.push(name, { type: "status", message: `Agent '${name}' stopped.` });
        }
        return;
      }
      const agentError =
        error instanceof Error ? error : new Error(String(error), { cause: error });
      entry.error = agentError;
      if (entry.phase === "running") {
        entry.phase = "failed";
        entry.port = undefined;
        this.push(name, {
          type: "status",
          message: `Agent '${name}' crashed: ${agentError.message}`,
        });
      }
    }
  }
}
