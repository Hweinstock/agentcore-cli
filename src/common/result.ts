interface SuccessResult<DataType extends Record<string, unknown> = {}> {
  success: true;
  data?: DataType;
}

interface FailureResult<ErrorType extends Error = Error> {
  success: false;
  error: ErrorType;
}

export type Result<DataType extends Record<string, unknown> = {}, ErrorType extends Error = Error> =
  | SuccessResult<DataType>
  | FailureResult<ErrorType>;

export function ok<DataType extends Record<string, unknown> = {}>(data?: DataType): SuccessResult<DataType> {
  return data ? { success: true, data } : { success: true };
}

export function err<ErrorType extends Error = Error>(err: ErrorType): FailureResult<ErrorType> {
  return { success: false, error: err };
}

export function wrapInResult<InputType extends unknown[], OutputType extends Record<string, unknown>>(
  handler: (...args: InputType) => Promise<OutputType>
): (...args: InputType) => Promise<Result<OutputType>>;
export function wrapInResult<InputType extends unknown[], OutputType extends Record<string, unknown>>(
  handler: (...args: InputType) => OutputType
): (...args: InputType) => Result<OutputType>;
export function wrapInResult<InputType extends unknown[], OutputType extends Record<string, unknown>>(
  handler: (...args: InputType) => OutputType | Promise<OutputType>
): (...args: InputType) => Result<OutputType> | Promise<Result<OutputType>> {
  return (...args: InputType) => {
    try {
      const output = handler(...args);
      if (output instanceof Promise) {
        return output.then(ok).catch(err);
      }
      return ok(output);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  };
}

export function mapResult<
  InputDataType extends Record<string, unknown>,
  ErrorType extends Error,
  OutputDataType extends Record<string, unknown>,
>(
  result: Result<InputDataType, ErrorType>,
  fn: (r?: InputDataType) => Promise<OutputDataType>
): Promise<Result<OutputDataType>> | Result<OutputDataType>;
export function mapResult<
  InputDataType extends Record<string, unknown>,
  ErrorType extends Error,
  OutputDataType extends Record<string, unknown>,
>(result: Result<InputDataType, ErrorType>, fn: (r?: InputDataType) => OutputDataType): Result<OutputDataType>;
export function mapResult<
  InputDataType extends Record<string, unknown>,
  ErrorType extends Error,
  OutputDataType extends Record<string, unknown>,
>(
  result: Result<InputDataType, ErrorType>,
  fn: (r?: InputDataType) => Promise<OutputDataType> | OutputDataType
): Promise<Result<OutputDataType>> | Result<OutputDataType> {
  if (!result.success) return result;

  const output = fn(result.data);

  if (output instanceof Promise) {
    return output.then(ok).catch(err);
  }
  return ok(output);
}

export function unwrapResult<DataType extends NonNullable<Record<string, unknown>>>(
  r: Result<DataType>,
  fallback: DataType
): DataType;
export function unwrapResult<DataType extends Record<string, unknown>>(
  r: Result<DataType>,
  fallback?: DataType
): DataType | undefined {
  if (r.success) return r.data;
  if (fallback) return fallback;
  throw r.error;
}
