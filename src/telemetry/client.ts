import type { Result } from '../common/result';
import type { TelemetryConfig } from '../global-config';
import type { Logger } from '../logging';
import { type AttributeRecorder, createAttributeRecorder } from './recorder';
import type { CommonAttributes } from './shapes';

// TODO: all types here should be generic over the metric shapes.
export interface TelemetryClient {
  emit: (metricName: string, attributes: Record<string, string>) => void;
  withTelemetry<R extends Result, A extends CommonAttributes>(
    metricName: string,
    fallbackAttributes: Partial<A>,
    handler: (recorder: AttributeRecorder<A>) => Promise<R>
  ): Promise<R>;
  withTelemetry<R extends Result, A extends CommonAttributes>(
    metricName: string,
    fallbackAttributes: Partial<A>,
    handler: (recorder: AttributeRecorder<A>) => R
  ): R;
  child: (attributeName: string, attributeValue: string) => TelemetryClient;
}

// TODO: implement a real telemetry client.
export const getTelemetryClient = (context: { logger: Logger }, _config?: TelemetryConfig): TelemetryClient =>
  getNullTelemetryClient(context);

export const getNullTelemetryClient = (context: { logger: Logger }, _config?: TelemetryConfig): TelemetryClient => ({
  emit: (metricName, attributes) => context.logger.info(`logging ${metricName}`, attributes),
  withTelemetry: <R extends Result, A extends CommonAttributes>(
    _metricName: string,
    _fallbackAttributes: Partial<A>,
    handler: (recorder: AttributeRecorder<A>) => R | Promise<R>
  ) => handler(createAttributeRecorder()),
  child: (_attributeName, _attributeValue) => getTelemetryClient(context),
});
