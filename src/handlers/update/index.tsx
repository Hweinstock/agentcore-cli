import z from "zod";
import { createHandler, flag } from "../../router";
import { SilentCLIError } from "../../errors";
import { JsonRendererKey } from "../../tui";
import type { AppIO } from "../../io";
import { handleUpdate } from "./action";

export const createUpdateHandler = (io: AppIO) =>
  createHandler({
    name: "update",
    description: "Check for and install CLI updates",
    flags: [flag("check", "check for updates without installing", z.boolean().default(false))],
    handle: async (ctx, flags) => {
      const result = await handleUpdate(flags.check, {
        onOutput: (chunk) => io.stderr.write(chunk),
      });

      ctx.require(JsonRendererKey).renderJson(result);

      if (result.status === "update-failed") {
        throw new SilentCLIError("failed to install update", { exitCode: 1 });
      }
    },
  });
