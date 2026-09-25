import z from "zod";
import { ResourceNotFoundError, InputValidationError } from "../../errors";
import { createHandler, flag } from "../../router";
import { JsonKey } from "../keys";
import type { AppIO } from "../../io";
import type { Core } from "../types";
import {
  assertMutuallyExclusiveFlags,
  contextForResource,
  coreOptsFromCtx,
  toResourceArn,
} from "../utils";
import { JsonRendererKey, renderTuiAt } from "../../tui";
import { regionFromArn, serviceIdFromArn } from "../../core/arn";
import { RegionKey } from "../keys";
import { invokeExecCommand } from "./operation";

export const createExecHandler = (core: Core, io: AppIO) =>
  createHandler({
    name: "exec",
    description: "run a shell command in a Runtime or harness",
    flags: [
      flag(
        "runtime",
        "the name a Runtime in the project, or ID of a Runtime in the account",
        z.string().min(1).optional(),
      ),
      flag(
        "harness",
        "the name of a harness in the project, or ID of a harness in the account",
        z.string().min(1).optional(),
      ),
      flag("command", "the shell command to run", z.string().optional()),
      flag(
        "session-id",
        "the session ID to run in (33-100 characters)",
        z.string().min(33).max(100).optional(),
      ),
      flag(
        "qualifier",
        "the endpoint qualifier to run in (default DEFAULT)",
        z.string().optional(),
      ),
      flag(
        "timeout",
        "seconds to wait for the command (1-3600)",
        z.number().int().min(1).max(3600).optional(),
      ),
    ],
    handle: async (ctx, flags) => {
      assertMutuallyExclusiveFlags(flags, ["runtime", "harness"]);

      const resourceType =
        flags.runtime !== undefined
          ? "runtime"
          : flags.harness !== undefined
            ? "harness"
            : undefined;
      const identifier = flags.runtime ?? flags.harness;
      if (resourceType === undefined || identifier === undefined) {
        throw new InputValidationError("specify one of --runtime or --harness");
      }

      const resourceCtx = await contextForResource({
        core,
        context: ctx,
        resourceType,
        identifier,
      });
      const resourceArn = await toResourceArn({
        core,
        context: resourceCtx,
        resourceType,
        identifier,
      });
      if (resourceArn === undefined) {
        throw new ResourceNotFoundError(
          `${resourceType === "runtime" ? "Runtime" : "Harness"} '${identifier}' was not found`,
        );
      }

      const resourceRegion = regionFromArn(resourceArn);
      const resolvedCtx = resourceRegion
        ? resourceCtx.withValue(RegionKey, resourceRegion)
        : resourceCtx;
      const resourceId = serviceIdFromArn(resourceArn);
      if (flags.command === undefined) {
        if (ctx.require(JsonKey)) {
          throw new InputValidationError("required option '--command <command>' not specified");
        }
        let path = `/agentcore/${resourceType === "runtime" ? "runtime/exec" : "harness/exec"}/${encodeURIComponent(resourceId)}`;
        if (flags["session-id"]) path += `/${encodeURIComponent(flags["session-id"])}`;
        const params = new URLSearchParams();
        if (flags.qualifier) params.set("qualifier", flags.qualifier);
        if (flags.timeout !== undefined) params.set("timeout", String(flags.timeout));
        if (params.size > 0) path += `?${params}`;
        await renderTuiAt(path, resolvedCtx, core, io);
        return;
      }

      const result = await invokeExecCommand({
        core,
        input: {
          resourceArn,
          command: flags.command,
          runtimeSessionId: flags["session-id"],
          qualifier: flags.qualifier ?? "DEFAULT",
          timeout: flags.timeout,
        },
        options: coreOptsFromCtx(resolvedCtx),
      });
      ctx.require(JsonRendererKey).renderJson(result);
    },
  });
