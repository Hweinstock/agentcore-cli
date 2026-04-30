import { globSync } from 'glob';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';

export interface TelemetryEntry {
  value: number;
  attrs: Record<string, string | number>;
}

export interface TelemetryHelper {
  /** Temp directory used as AGENTCORE_CONFIG_DIR */
  dir: string;
  /** Env vars to pass to runCLI to enable audit mode */
  env: { AGENTCORE_TELEMETRY_AUDIT: '1'; AGENTCORE_CONFIG_DIR: string };
  /** Read all JSONL entries from the audit telemetry directory */
  readEntries: () => TelemetryEntry[];
  /** Delete telemetry entries only (keeps the config dir) */
  clearEntries: () => void;
  /** Delete the entire config directory — call in afterAll */
  destroy: () => void;
}

export function createTelemetryHelper(): TelemetryHelper {
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
    clearEntries() {
      rmSync(join(dir, 'telemetry'), { recursive: true, force: true });
    },
    destroy() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Assert that at least one telemetry entry was emitted matching the given attrs. */
export function assertTelemetry(entries: TelemetryEntry[], expected: Record<string, string | number | boolean>): void {
  const match = entries.find(e => Object.entries(expected).every(([k, v]) => String(e.attrs[k]) === String(v)));
  expect(match, `No telemetry entry matching ${JSON.stringify(expected)}`).toBeDefined();
}
