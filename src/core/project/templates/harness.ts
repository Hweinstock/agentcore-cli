import { ZodError, z } from "zod";
import { HarnessSpecSchema } from "../../../projectSchemas/harness";
import { FsTreeNode } from "./fsTree";
import { InputValidationError } from "../../../errors/errors";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant";
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export async function createHarnessTreeFromSpec(
  spec: z.input<typeof HarnessSpecSchema>,
): Promise<FsTreeNode> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { systemPrompt, ...rest } = spec;
  const parsed = parseHarnessSpec(rest);
  return FsTreeNode.createDirectory(".", [
    FsTreeNode.createFile("harness.json", async () => json(parsed)),
    FsTreeNode.createFile(
      "system-prompt.md",
      async () => spec.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    ),
  ]);
}

function parseHarnessSpec(spec: z.input<typeof HarnessSpecSchema>) {
  try {
    return HarnessSpecSchema.parse(spec);
  } catch (err) {
    if (err instanceof ZodError) throw new InputValidationError(z.prettifyError(err));
    throw err;
  }
}
