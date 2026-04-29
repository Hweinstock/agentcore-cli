export { resolveTelemetryPreference, resolveResourceAttributes, resolveAuditFilePath } from './config.js';
export type { TelemetryPreference } from './config.js';
export { TelemetryClient, CANCELLED } from './client.js';
export { type MetricSink, CompositeSink } from './sinks/metric-sink.js';
export { OtelMetricSink, type OtelMetricSinkConfig } from './sinks/otel-metric-sink.js';
export { FilesystemSink, type FilesystemSinkConfig } from './sinks/filesystem-sink.js';
export { classifyError, isUserError } from './error-classification.js';
