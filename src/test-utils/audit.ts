import { globSync } from 'glob';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TelemetryEntry {
  value: number;
  attrs: Record<string, string | number>;
}

export interface AuditContext {
  /** Temp directory used as AGENTCORE_CONFIG_DIR */
  dir: string;
  /** Env vars to pass to runCLI */
  env: { AGENTCORE_TELEMETRY_AUDIT: '1'; AGENTCORE_CONFIG_DIR: string };
  /** Read all JSONL entries from the audit telemetry directory */
  readEntries: () => TelemetryEntry[];
  /** Delete the telemetry subdirectory */
  clear: () => void;
  /** Delete the entire config directory */
  cleanup: () => void;
}

export function createAuditContext(): AuditContext {
  const dir = mkdtempSync(join(tmpdir(), 'agentcore-audit-'));
  return {
    dir,
    env: { AGENTCORE_TELEMETRY_AUDIT: '1', AGENTCORE_CONFIG_DIR: dir },
    readEntries() {
      return globSync(join(dir, 'telemetry', '*.json')).flatMap(f =>
        readFileSync(f, 'utf-8')
          .trim()
          .split('\n')
          .map(line => JSON.parse(line) as TelemetryEntry)
      );
    },
    clear() {
      rmSync(join(dir, 'telemetry'), { recursive: true, force: true });
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
