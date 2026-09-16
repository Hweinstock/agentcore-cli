import { beforeAll } from "bun:test";
import {
  CloudFormationClient,
  DeleteStackCommand,
  ListStacksCommand,
} from "@aws-sdk/client-cloudformation";

const region = process.env.AWS_REGION ?? "us-east-1";
const stackPrefix = "AgentCore-e2e";
const staleAgeMs = 24 * 60 * 60 * 1000;
const deletableStatuses = new Set([
  "CREATE_COMPLETE",
  "UPDATE_COMPLETE",
  "CREATE_FAILED",
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "UPDATE_ROLLBACK_COMPLETE",
  "UPDATE_ROLLBACK_FAILED",
  "DELETE_FAILED",
]);

export async function cleanupStaleStacks(
  cfn: CloudFormationClient,
): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];
  let nextToken: string | undefined;
  do {
    const page = await cfn.send(new ListStacksCommand({ NextToken: nextToken }));
    nextToken = page.NextToken;
    for (const stack of page.StackSummaries ?? []) {
      const status = stack.StackStatus ?? "";
      const age = Date.now() - (stack.CreationTime?.getTime() ?? Date.now());
      if (stack.ParentId || !stack.StackName?.startsWith(stackPrefix)) continue;
      if (!deletableStatuses.has(status) || age < staleAgeMs) continue;
      try {
        await cfn.send(new DeleteStackCommand({ StackName: stack.StackName }));
        deleted.push(stack.StackName);
      } catch {
        failed.push(stack.StackName);
      }
    }
  } while (nextToken);
  return { deleted, failed };
}

beforeAll(async () => {
  const cfn = new CloudFormationClient({ region });
  try {
    const { deleted, failed } = await cleanupStaleStacks(cfn);
    console.log(`[e2e] stale-stack cleanup: deleted=${deleted.length} failed=${failed.length}`);
    if (failed.length > 0) console.warn(`[e2e] cleanup failed for: ${failed.join(", ")}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[e2e] stale-stack cleanup skipped: ${detail}`);
  } finally {
    cfn.destroy();
  }
});
