interface AgentCoreErrorOptions {
  exitCode: number;
  source: 'user' | 'client' | 'service' | 'unknown';
}

export class AgentCoreError extends Error {
  public readonly exitCode;
  public readonly source;

  constructor(message: string, options: AgentCoreErrorOptions) {
    super(message);
    this.exitCode = options.exitCode;
    this.source = options.source;
  }
}

export class ValidationError extends AgentCoreError {
  constructor(message: string, options?: AgentCoreErrorOptions) {
    super(message, { exitCode: options?.exitCode ?? 1, source: options?.source ?? 'user' });
  }
}

export class FileSystemIOError extends AgentCoreError {
  constructor(message: string, options?: AgentCoreErrorOptions) {
    super(message, { exitCode: options?.exitCode ?? 1, source: options?.source ?? 'user' });
  }
}

export class NoProjectFoundError extends AgentCoreError {
  constructor(message?: string, options?: AgentCoreErrorOptions) {
    super(message ?? 'No AgentCore Project Found!', {
      exitCode: options?.exitCode ?? 1,
      source: options?.source ?? 'user',
    });
  }
}

export class ConfigReadError extends AgentCoreError {
  constructor(message: string, options?: AgentCoreErrorOptions) {
    super(message, {
      exitCode: options?.exitCode ?? 1,
      source: options?.source ?? 'user',
    });
  }
}

export class PollTimeoutError extends AgentCoreError {
  constructor(message: string, options?: AgentCoreErrorOptions) {
    super(message, {
      exitCode: options?.exitCode ?? 1,
      source: options?.source ?? 'service',
    });
  }
}

export class TemplateError extends AgentCoreError {
  constructor(message: string, options?: AgentCoreErrorOptions) {
    super(message, {
      exitCode: options?.exitCode ?? 1,
      source: options?.source ?? 'client',
    });
  }
}
