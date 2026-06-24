import { ValidationError } from '../errors';
import { type OkResult, type Result, ok, wrap } from '../result';

export function tryParseJson(value: string, fallback: unknown): OkResult<unknown>;
export function tryParseJson(value: string): Result<unknown, ValidationError>;
export function tryParseJson(value: string, fallback?: unknown): Result<unknown, ValidationError> {
  const result = wrap(() => JSON.parse(value) as unknown)().mapError(e => new ValidationError(e.message));
  return !result.success && fallback !== undefined ? ok(fallback) : result;
}
