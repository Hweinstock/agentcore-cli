import { renderTui } from "../tui";
import type { AppIO } from "../io";
import type { Core } from "../handlers/types";
import { PathKey, ProjectKey, type Middleware } from "../router";
import { CommandKey } from "../router/router";
import { attributeName } from "../router/flags";
import { JsonKey } from "../handlers/keys";

export function withTuiOnEmptyFlagsAndArgs(core: Core, io: AppIO): Middleware {
  const boundRenderTui = renderTui(core, io);
  const isInteractive = () => io.stdin.isTTY === true && io.stdout.isTTY === true;

  return (h) => ({
    name: () => h.name(),
    description: () => h.description(),
    flags: () => h.flags(),
    arguments: () => h.arguments(),
    doesSupportTui: () => h.doesSupportTui(),
    children: () => h.children(),
    handle: async (ctx, flags, args) => {
      const command = ctx.require(CommandKey);
      const noFlagsPassed = h
        .flags()
        .every((f) => command.getOptionValueSource(attributeName(f.name)) !== "cli");

      if (
        isInteractive() &&
        h.doesSupportTui() &&
        !ctx.value(JsonKey) &&
        noFlagsPassed &&
        command.args.length === 0
      ) {
        const path = ctx.value(PathKey);
        const needsProject =
          path === "/agentcore/project/add" ||
          path?.startsWith("/agentcore/project/add/") === true ||
          path === "/agentcore/project/build" ||
          path === "/agentcore/project/deploy" ||
          path === "/agentcore/project/invoke" ||
          path === "/agentcore/project/status";
        if (needsProject && !ctx.value(ProjectKey)) {
          const project = await core.projectManager.resolve({ filePath: process.cwd() });
          if (!project) return h.handle(ctx, flags, args);
          ctx = ctx.withValue(ProjectKey, project);
        }
        await boundRenderTui(ctx, flags, args);
        return;
      }
      await h.handle(ctx, flags, args);
    },
  });
}
