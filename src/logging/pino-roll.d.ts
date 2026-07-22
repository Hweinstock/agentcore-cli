// Type declarations for pino-roll, which does not ship its own types.
// Source of truth: https://github.com/mcollina/pino-roll/blob/master/pino-roll.js
declare module "pino-roll" {
  import type { SonicBoom, SonicBoomOpts } from "sonic-boom";

  interface LimitOptions {
    count?: number;
  }

  interface PinoRollOptions extends Omit<SonicBoomOpts, "dest"> {
    /** Absolute or relative path to the log file. */
    file: string;
    /** Maximum size before rotation (e.g. "10m", "1g"). */
    size?: string | number;
    /** Rotation frequency ("daily", "hourly", or milliseconds). */
    frequency?: string | number;
    /** File extension appended after the number (e.g. ".log"). */
    extension?: string;
    /** Whether to create a symlink to the current log file. */
    symlink?: boolean;
    /** Date format string appended to the file name. */
    dateFormat?: string;
    /** Strategy for removing old log files. */
    limit?: LimitOptions;
    /** Create parent directories if they don't exist. */
    mkdir?: boolean;
  }

  /**
   * Creates a Pino transport (a SonicBoom stream) that writes to files
   * and automatically rotates based on size, frequency, or both.
   */
  export default function pinoRoll(options: PinoRollOptions): Promise<SonicBoom>;
}
