import type { TelemetryConfig } from '../global-config';
import type { Logger } from '../logging';

export interface TelemetryClient {
  emit: (metricName: string, attributes: Record<string, string>) => void;
  // TODO: add with to the interface for wrapping functionality.
}

export const getTelemetryClient = (props: { logger: Logger; config?: TelemetryConfig }): TelemetryClient => ({
  emit: (metricName: string, attributes: Record<string, string>) =>
    props.logger.info(`logging ${metricName}`, attributes),
});
