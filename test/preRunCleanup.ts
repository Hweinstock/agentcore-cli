import {
  CloudFormationClient,
  DeleteStackCommand,
  ListStacksCommand,
} from "@aws-sdk/client-cloudformation";

const region = process.env.AWS_REGION ?? "us-east-1";
const stackPrefix = "AgentCore-e2e";
const staleAgeMs = 2 * 60 * 60 * 1000;

export async function cleanupStaleStacks(cfn: CloudFormationClient): Promise<void> {
  let nextToken: string | undefined;
  do {
    const page = await cfn.send(new ListStacksCommand({ NextToken: nextToken }));
    nextToken = page.NextToken;
    for (const stack of page.StackSummaries ?? []) {
      const status = stack.StackStatus ?? "";
      const age = Date.now() - (stack.CreationTime?.getTime() ?? Date.now());
      if (stack.ParentId || !stack.StackName?.startsWith(stackPrefix)) continue;
      if (status === "DELETE_COMPLETE" || status.endsWith("_IN_PROGRESS") || age < staleAgeMs)
        continue;
      try {
        await cfn.send(new DeleteStackCommand({ StackName: stack.StackName }));
      } catch {
        // Leave it for the next run rather than failing this one.
      }
    }
  } while (nextToken);
}

await cleanupStaleStacks(new CloudFormationClient({ region }));
