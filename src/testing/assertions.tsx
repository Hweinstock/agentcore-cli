import { expect } from "bun:test";
import { InputValidationError } from "../errors";

export async function expectInputValidationError(
  promise: Promise<unknown>,
  message: string,
): Promise<void> {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(InputValidationError);
  expect(error).toHaveProperty("message", message);
}
