import z from "zod";
import { InputValidationError, ResourceNotFoundError } from "../../errors";
import type { AppIO } from "../../io";
import { createHandler, flag } from "../../router";
import { JsonKey, RegionKey } from "../keys";
import type { Core } from "../types";
import { contextForResource, toResourceArn } from "../utils";
import { regionFromArn, serviceIdFromArn } from "../../core/arn";
import { runRuntimeShell } from "../runtime/shell/operation";

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
      const bearerToken = flags["bearer-token"];
      const launchContext = {
        runtimeId,
        runtimeSessionId: flags["session-id"],
        bearerToken,
      };

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
