import { Router } from "../../../../router";
import type { AppIO } from "../../../../io";
import type { Core } from "../../../types";
import { createConfigBundleRunHandler } from "./run";

export function createConfigBundleAbTestHandler(core: Core, io: AppIO): Router {
  return new Router("config-bundle", "config-bundle A/B tests").handler(
    createConfigBundleRunHandler(core, io),
  );
}
