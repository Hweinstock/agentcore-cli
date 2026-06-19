// placeholder for real telemetry schema.

export interface CommonAttributes {
  duration: number;
}

export interface CommandRunAttributes extends CommonAttributes {
  command: string;
  commandGroup: string;
}
