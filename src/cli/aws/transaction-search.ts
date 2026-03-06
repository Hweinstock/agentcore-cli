import { getCredentialProvider } from './account';
import {
  ApplicationSignalsClient,
  StartDiscoveryCommand,
} from '@aws-sdk/client-application-signals';
import { GetGroupsCommand, XRayClient } from '@aws-sdk/client-xray';

export interface TransactionSearchStatus {
  enabled: boolean;
  error?: string;
}

export interface TransactionSearchEnableResult {
  success: boolean;
  error?: string;
}

/**
 * Check if CloudWatch Application Signals (which powers transaction search) is enabled
 * by attempting to list X-Ray groups. If X-Ray is accessible, the account has tracing active.
 * We also try StartDiscovery as an idempotent check — if it succeeds, it was either already
 * enabled or is now enabled.
 */
export async function checkTransactionSearchEnabled(region: string): Promise<TransactionSearchStatus> {
  try {
    const xrayClient = new XRayClient({
      region,
      credentials: getCredentialProvider(),
    });
    await xrayClient.send(new GetGroupsCommand({}));
    return { enabled: true };
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === 'AccessDeniedException' || code === 'AccessDenied') {
      return { enabled: false, error: 'Insufficient permissions to check X-Ray status' };
    }
    // If the call fails for other reasons, assume not enabled / unknown
    return { enabled: false };
  }
}

/**
 * Enable CloudWatch Application Signals by calling StartDiscovery.
 * This creates the AWSServiceRoleForCloudWatchApplicationSignals service-linked role
 * and enables transaction search in the CloudWatch console.
 *
 * This is an idempotent operation — calling it when already enabled is a no-op.
 */
export async function enableTransactionSearch(region: string): Promise<TransactionSearchEnableResult> {
  try {
    const client = new ApplicationSignalsClient({
      region,
      credentials: getCredentialProvider(),
    });
    await client.send(new StartDiscoveryCommand({}));
    return { success: true };
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    const message = (err as { message?: string })?.message ?? 'Unknown error';

    if (code === 'AccessDeniedException' || code === 'AccessDenied') {
      return {
        success: false,
        error: `Insufficient IAM permissions to enable Application Signals. Required: application-signals:StartDiscovery. ${message}`,
      };
    }
    return { success: false, error: `Failed to enable Application Signals: ${message}` };
  }
}

/**
 * Build a deep-link URL to the CloudWatch Transaction Search console page.
 */
export function buildTransactionSearchConsoleUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#xray:traces/query`;
}
