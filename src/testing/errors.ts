import { expect } from "bun:test";
import { InputValidationError } from "../errors";

type ErrorConstructor = abstract new (...args: never[]) => Error;

export async function expectError(
  promise: Promise<unknown>,
  message: string | RegExp,
  errorType: ErrorConstructor = InputValidationError,
): Promise<void> {
  const error = await promise.catch((caught: unknown) => caught);
  const expectedMessage =
    typeof message === "string" ? expect.stringContaining(message) : expect.stringMatching(message);

  expect(error).toBeInstanceOf(errorType);
  expect(error).toHaveProperty("message", expectedMessage);
}
