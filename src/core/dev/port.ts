import { InputValidationError } from "../../errors";
import type { ProjectRuntime } from "../../projectSchemas/runtime";
import type { PortChecker } from "../../io";

const MAX_PORT_ATTEMPTS = 100;
export const DEV_PORTS = { HTTP: 8080, AGUI: 8080, MCP: 8000, A2A: 9000 } as const;

export type DevPort = {
  port: number;
  requestedPort: number;
};

export type DevPortAssignment = { port: number } | { error: unknown };

export class PortInUseError extends InputValidationError {
  constructor(port: number) {
    super(
      `Port ${port} is already in use. Find the process with ` +
        `'lsof -i :${port}' (macOS/Linux) or 'netstat -ano | findstr :${port}' (Windows), ` +
        "then stop it or choose a different --port.",
    );
  }
}

export async function resolveDevPort(
  protocol: ProjectRuntime["protocol"],
  explicitPort: number | undefined,
  checkPort: PortChecker,
  signal: AbortSignal,
): Promise<DevPort> {
  return findFreePort(DEV_PORTS[protocol ?? "HTTP"], explicitPort, checkPort, signal);
}

/** Resolve a distinct port or allocation error for every runtime before launching any of them. */
export async function resolveDevPorts(
  runtimes: ProjectRuntime[],
  explicitPort: number | undefined,
  checkPort: PortChecker,
  signal: AbortSignal,
): Promise<Map<string, DevPortAssignment>> {
  const assignments = new Map<string, DevPortAssignment>();
  const reservedPorts = new Set<number>();

  for (const runtime of runtimes) {
    try {
      const { port } = await resolveDevPort(
        runtime.protocol,
        explicitPort,
        async (candidate, checkSignal) =>
          !reservedPorts.has(candidate) && checkPort(candidate, checkSignal),
        signal,
      );
      assignments.set(runtime.name, { port });
      reservedPorts.add(port);
    } catch (error) {
      signal.throwIfAborted();
      assignments.set(runtime.name, { error });
    }
  }

  return assignments;
}

/**
 * Resolve a free port from `defaultPort`. An explicit port must be free or the
 * call fails; otherwise the next free port from the default up is taken.
 */
export async function findFreePort(
  defaultPort: number,
  explicitPort: number | undefined,
  checkPort: PortChecker,
  signal: AbortSignal,
): Promise<DevPort> {
  const requestedPort = explicitPort ?? defaultPort;

  if (await checkPort(requestedPort, signal)) {
    return { port: requestedPort, requestedPort };
  }

  if (explicitPort !== undefined) {
    throw new PortInUseError(requestedPort);
  }

  for (let port = requestedPort + 1; port < requestedPort + MAX_PORT_ATTEMPTS; port++) {
    if (await checkPort(port, signal)) return { port, requestedPort };
  }

  throw new InputValidationError(
    `No free port found in range ${requestedPort}-${requestedPort + MAX_PORT_ATTEMPTS - 1}.`,
  );
}
