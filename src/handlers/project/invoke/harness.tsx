import { join } from "node:path";
import type { InvokeHarnessRequest } from "@aws-sdk/client-bedrock-agentcore";
import { invokeLocalHarness } from "../../../core/dev/localInvoke";
import { DEV_PORTS } from "../../../core/dev/port";
import { InputValidationError } from "../../../errors";
import type { AppIO } from "../../../io";
import type { HarnessRegistryEntry } from "../../../projectSchemas/harness";
import type { Context } from "../../../router";
import { withUserCancellation } from "../../../runnable";
import { JsonRendererKey } from "../../../tui";
import { runWithProgress } from "../../../tui/progress";
import { invokeHarnessTurn } from "../../harness/invoke/operation";
import { JsonKey } from "../../keys";
import { coreOptsFromCtx } from "../../utils";
import type { Project } from "../types";
import type { InvokeFlags } from ".";

export async function invokeProjectHarnessLocally(
  io: AppIO,
  ctx: Context,
  project: Project,
  harness: HarnessRegistryEntry,
  flags: InvokeFlags,
): Promise<void> {
  for (const name of ["target", "qualifier"] as const) {
    if (flags[name] !== undefined) {
      throw new InputValidationError(`--${name} cannot be used with --local`);
    }
  }
  if (!flags.prompt) {
    throw new InputValidationError("required option '--prompt <text>' not specified");
  }
  const harnessDirectory = join(project.rootPath, harness.path);
  const client = {
    getHarness: async () => ({ harness: undefined }),
    invokeHarness: (request: InvokeHarnessRequest, _options: unknown, signal?: AbortSignal) =>
      invokeLocalHarness(flags.port ?? DEV_PORTS.HTTP, harnessDirectory, request, signal),
  };
  const result = await withUserCancellation((signal) =>
    runWithProgress(
      () =>
        invokeHarnessTurn(
          client,
          { harnessId: harness.name, prompt: flags.prompt!, sessionId: flags["session-id"] },
          coreOptsFromCtx(ctx),
          signal,
        ),
      { io, label: "Invoking harness...", interactive: !ctx.require(JsonKey) },
    ),
  );
  ctx.require(JsonRendererKey).renderJson(result);
}
