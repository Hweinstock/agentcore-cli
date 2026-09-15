import { Router } from "../../../router";
import { createExportHarnessHandler } from "./harness";
import type { ExportProjectResourceConfig } from "./types";

export function createExportProjectResourceHandler(config: ExportProjectResourceConfig): Router {
  const projectExport = new Router(
    "export",
    "convert project resources into editable code you own",
  );
  projectExport.handler(createExportHarnessHandler(config));
  return projectExport;
}
