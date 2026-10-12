import { readFile } from "node:fs/promises";
import { enclosingProjectRoot, projectSpecPath } from "./fsUtils";

/** Detects a legacy project without requiring its spec to be valid or supported. */
export async function isV0Project(directory: string): Promise<boolean> {
  try {
    const rootPath = enclosingProjectRoot(directory);
    if (!rootPath) return false;
    const spec: unknown = JSON.parse(await readFile(projectSpecPath(rootPath), "utf8"));
    return typeof spec === "object" && spec !== null && "version" in spec && spec.version === 1;
  } catch {
    return false;
  }
}
