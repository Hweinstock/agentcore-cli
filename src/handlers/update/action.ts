import semver from "semver";
import { runProcess, type ProcessRunner } from "../../io";
import { NetworkingError } from "../../errors";
import { PACKAGE_VERSION } from "../../constants";

const PACKAGE_NAME = "@aws/agentcore";
const REGISTRY_URL = "https://registry.npmjs.org";

function distTag(): string {
  return PACKAGE_VERSION.includes("-") ? "preview" : "latest";
}

export function installArgv(): string[] {
  return ["npm", "install", "-g", `${PACKAGE_NAME}@${distTag()}`];
}

export async function fetchLatestVersion(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${REGISTRY_URL}/${PACKAGE_NAME}/latest`);
  } catch (cause) {
    throw new NetworkingError(
      `Could not reach the npm registry: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (!response.ok) {
    throw new NetworkingError(`Failed to fetch latest version: ${response.statusText}`);
  }
  const data = (await response.json()) as { version: string };
  return data.version;
}

export type UpdateStatus =
  "up-to-date" | "newer-local" | "update-available" | "updated" | "update-failed";

export interface UpdateResult {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string;
  error?: string;
}

export interface HandleUpdateOptions {
  runner?: ProcessRunner;
  onOutput?: (chunk: string) => void;
}

export async function handleUpdate(
  checkOnly: boolean,
  { runner = runProcess, onOutput }: HandleUpdateOptions = {},
): Promise<UpdateResult> {
  const latestVersion = await fetchLatestVersion();
  const comparison = semver.compare(latestVersion, PACKAGE_VERSION);

  if (comparison === 0) {
    return { status: "up-to-date", currentVersion: PACKAGE_VERSION, latestVersion };
  }
  if (comparison < 0) {
    return { status: "newer-local", currentVersion: PACKAGE_VERSION, latestVersion };
  }
  if (checkOnly) {
    return { status: "update-available", currentVersion: PACKAGE_VERSION, latestVersion };
  }

  try {
    await runner(installArgv(), { cwd: process.cwd(), onOutput });
    return { status: "updated", currentVersion: PACKAGE_VERSION, latestVersion };
  } catch (cause) {
    return {
      status: "update-failed",
      currentVersion: PACKAGE_VERSION,
      latestVersion,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
