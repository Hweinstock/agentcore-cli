import type { MetricSink } from './metric-sink.js';
import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface FilesystemSinkConfig {
  filePath: string;
  log?: (message: string) => void;
}

export class FilesystemSink implements MetricSink {
  private readonly filePath: string;
  private readonly log: (message: string) => void;
  private hasRecords = false;

  constructor(config: FilesystemSinkConfig) {
    this.filePath = config.filePath;
    this.log = config.log ?? (msg => console.log(msg));
  }

  record(value: number, attrs: Record<string, string | number>): void {
    this.hasRecords = true;
    this.pendingWrite = this.pendingWrite.then(() => this.appendEntry({ value, attrs }));
  }

  async flush(): Promise<void> {
    await this.pendingWrite;
  }

  async shutdown(): Promise<void> {
    await this.pendingWrite;
    if (this.hasRecords) {
      this.log(`[audit mode] Telemetry written to ${this.filePath}`);
    }
  }

  private pendingWrite: Promise<void> = Promise.resolve();

  private async appendEntry(entry: { value: number; attrs: Record<string, string | number> }): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(entry) + '\n');
  }
}
