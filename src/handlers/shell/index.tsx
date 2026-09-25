import z from "zod";
import { InputValidationError, ResourceNotFoundError } from "../../errors";
import type { AppIO } from "../../io";
import { createHandler, flag } from "../../router";
import { JsonKey, RegionKey } from "../keys";
import type { Core } from "../types";
import { renderTuiAt } from "../../tui";
import { contextForResource, toResourceArn } from "../utils";
import { regionFromArn, serviceIdFromArn } from "../../core/arn";
import { RuntimeShellLaunchContextKey } from "../runtime/shell/launchContext";
import { runRuntimeShell } from "../runtime/shell/operation";
import { resolveRuntimeShellBearerToken } from "../runtime/shell/request";

export const createShellHandler = (core: Core, io: AppIO) =>
  createHandler({
    name: "shell",
    description: "open an interactive shell in a Runtime",
    flags: [
      flag("runtime", "the ID of the Runtime", z.string().min(1)),
      flag("qualifier", "the endpoint qualifier", z.string().min(1).optional()),
      flag("session-id", "the session ID to use", z.string().min(33).max(256).optional()),
      flag("bearer-token", "the CUSTOM_JWT bearer token", z.string().optional(), {
        sensitive: true,
      }),
    ],
    handle: async (ctx, flags) => {
      if (ctx.require(JsonKey)) {
        throw new InputValidationError("--json cannot be used with runtime shell");
      }

      const resourceCtx = await contextForResource({
        core,
        context: ctx,
        resourceType: "runtime",
        identifier: flags.runtime,
      });
      const resourceArn = await toResourceArn({
        core,
        context: resourceCtx,
        resourceType: "runtime",
        identifier: flags.runtime,
      });
      if (resourceArn === undefined) {
        throw new ResourceNotFoundError(`Runtime '${flags.runtime}' was not found`);
      }

      const resourceRegion = regionFromArn(resourceArn);
      const resolvedCtx = resourceRegion
        ? resourceCtx.withValue(RegionKey, resourceRegion)
        : resourceCtx;
      const runtimeId = serviceIdFromArn(resourceArn);
      const bearerToken = await resolveRuntimeShellBearerToken(flags["bearer-token"], io.stdin);
      const launchContext = {
        runtimeId,
        runtimeSessionId: flags["session-id"],
        bearerToken,
      };

      if (flags.qualifier === undefined) {
        await renderTuiAt(
          `/agentcore/runtime/shell/${encodeURIComponent(runtimeId)}`,
          resolvedCtx.withValue(RuntimeShellLaunchContextKey, launchContext),
          core,
          io,
        );
        return;
      }

      await runRuntimeShell({
        ctx: resolvedCtx,
        core,
        io,
        runtimeId,
        qualifier: flags.qualifier ?? "DEFAULT",
        launchContext,
      });
    },
  });
