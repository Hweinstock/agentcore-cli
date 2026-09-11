import { renderTui } from "../tui";
import type { AppIO } from "../io";
import type { Core } from "../handlers/types";
import { type Middleware } from "../router";
import { TuiKey } from "../router/router";

// withTuiOnEmptyFlagsAndArgs opens the interactive TUI when a leaf command is
// invoked with no flags or arguments (and not in JSON mode); otherwise it
// delegates to the wrapped handler.
export function withTuiOnEmptyFlagsAndArgs(core: Core, io: AppIO): Middleware {
  const boundRenderTui = renderTui(core, io);

  return (h) => ({
    name: () => h.name(),
    description: () => h.description(),
    flags: () => h.flags(),
    arguments: () => h.arguments(),
    doesSupportTui: () => h.doesSupportTui(),
    children: () => h.children(),
    handle: async (ctx, flags, args) => {
      if (ctx.value(TuiKey)) {
        await boundRenderTui(ctx, flags, args);
        return;
      } else {
        await h.handle(ctx, flags, args);
      }
    },
  });
}
