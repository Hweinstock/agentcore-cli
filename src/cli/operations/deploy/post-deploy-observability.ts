import {
  buildTransactionSearchConsoleUrl,
  checkTransactionSearchEnabled,
  enableTransactionSearch,
} from '../../aws/transaction-search';

export interface TransactionSearchSetupOptions {
  region: string;
  agentNames: string[];
  autoConfirm?: boolean;
}

export interface TransactionSearchSetupResult {
  success: boolean;
  enabled: boolean;
  skipped: boolean;
  consoleUrl?: string;
  error?: string;
}

/**
 * Post-deploy step: check if CloudWatch Transaction Search is enabled, and enable it if not.
 * This is a non-blocking best-effort operation — failures do not fail the deploy.
 */
export async function setupTransactionSearch(
  options: TransactionSearchSetupOptions
): Promise<TransactionSearchSetupResult> {
  const { region, agentNames, autoConfirm } = options;

  if (agentNames.length === 0) {
    return { success: true, enabled: false, skipped: true };
  }

  // Check current status
  const status = await checkTransactionSearchEnabled(region);

  if (status.enabled) {
    return {
      success: true,
      enabled: true,
      skipped: false,
      consoleUrl: buildTransactionSearchConsoleUrl(region),
    };
  }

  // Not enabled — attempt to enable if autoConfirm is set
  // In the CLI (non-TUI) path, autoConfirm corresponds to --yes flag
  // In the TUI path, we always attempt since the user has already confirmed deploy
  if (!autoConfirm) {
    return { success: true, enabled: false, skipped: true };
  }

  const enableResult = await enableTransactionSearch(region);

  if (!enableResult.success) {
    return {
      success: false,
      enabled: false,
      skipped: false,
      error: enableResult.error,
    };
  }

  return {
    success: true,
    enabled: true,
    skipped: false,
    consoleUrl: buildTransactionSearchConsoleUrl(region),
  };
}
