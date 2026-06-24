// placeholder for real telemetry schema.
// these will be validated via zod.

export interface CommonAttributes {
  duration: number;
}

export interface CommandRunAttributes extends CommonAttributes {
  command: string;
  commandGroup: string;
}
