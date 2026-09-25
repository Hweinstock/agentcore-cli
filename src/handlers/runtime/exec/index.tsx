import z from "zod";
import { createHandler, flag, PathKey } from "../../../router";
import { InputValidationError } from "../../../errors";
import { JsonKey } from "../../keys";
import { JsonRendererKey, renderTuiAt } from "../../../tui";
import type { AppIO } from "../../../io";
import type { Core } from "../../types";
import { coreOptsFromCtx } from "../../utils";
import { runtimeIdSchema } from "../invoke/request";
import { invokeExecCommand } from "../../exec/operation";

export const createRuntimeExecHandler = (core: Core, io: AppIO) =>
  createHandler({
    name: "exec",
    description: "run a shell command in a Runtime",
    flags: [
      flag("id", "the ID of the Runtime", runtimeIdSchema),
      flag("command", "the shell command to run", z.string().optional()),
      flag(
        "session-id",
        "the Runtime session ID to run in (33-100 characters)",
        z.string().min(33).max(100).optional(),
      ),
      flag(
        "qualifier",
        "the Runtime endpoint qualifier to run in (default DEFAULT)",
        z.string().optional(),
      ),
      flag(
        "timeout",
        "seconds to wait for the command (1-3600)",
        z.number().min(1).max(3600).optional(),
      ),
    ],
    handle: async (ctx, flags) => {
      if (!flags.command) {
        if (ctx.require(JsonKey)) {
          throw new InputValidationError("required option '--command <command>' not specified");
        }
        let path = `${ctx.require(PathKey)}/${encodeURIComponent(flags.id)}`;
        if (flags["session-id"]) path += `/${encodeURIComponent(flags["session-id"])}`;
        const params = new URLSearchParams();
        if (flags.qualifier) params.set("qualifier", flags.qualifier);
        if (flags.timeout !== undefined) params.set("timeout", String(flags.timeout));
        if (params.size > 0) path += `?${params}`;
        await renderTuiAt(path, ctx, core, io);
        return;
      }

      const result = await invokeExecCommand({
        core,
        input: {
          resourceArn: (await core.runtime.getRuntime(flags.id, coreOptsFromCtx(ctx)))
            .agentRuntimeArn!,
          command: flags.command,
          runtimeSessionId: flags["session-id"],
          qualifier: flags.qualifier ?? "DEFAULT",
          timeout: flags.timeout,
        },
        options: coreOptsFromCtx(ctx),
      });
      ctx.require(JsonRendererKey).renderJson(result);
    },
  });

export { RuntimeExecScreen } from "./screen";
