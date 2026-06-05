import type { TelemetryConfig } from '../global-config';
import type { Logger } from '../logging';

export interface TelemetryClient {
  emit: (metricName: string, attributes: Record<string, string>) => void;
}

export const getTelemetryClient = (props: { logger: Logger; config?: TelemetryConfig }): TelemetryClient => ({
  emit: (metricName: string, attributes: Record<string, string>) =>
    props.logger.info(`logging ${metricName}`, attributes),
});
