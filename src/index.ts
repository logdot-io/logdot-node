/**
 * LogDot SDK for Node.js
 *
 * Cloud logging and metrics made simple.
 *
 * @example
 * ```typescript
 * import { LogDotLogger, LogDotMetrics } from 'logdot';
 *
 * // === LOGGING ===
 * const logger = new LogDotLogger({
 *   apiKey: 'ilog_live_YOUR_API_KEY',
 *   hostname: 'my-service',
 * });
 *
 * await logger.info('Application started');
 * await logger.error('Something went wrong', { error_code: 500 });
 *
 * // Context-aware logging
 * const userLogger = logger.withContext({ user_id: 123 });
 * await userLogger.info('User action'); // Includes user_id automatically
 *
 * // === METRICS ===
 * const metrics = new LogDotMetrics({
 *   apiKey: 'ilog_live_YOUR_API_KEY',
 * });
 *
 * // Create or find an entity
 * const entity = await metrics.getOrCreateEntity({
 *   name: 'my-service',
 *   description: 'Production service',
 * });
 *
 * // Bind to the entity and send metrics
 * const metricsClient = metrics.forEntity(entity.id);
 * await metricsClient.send('cpu.usage', 45.5, 'percent');
 * await metricsClient.send('response_time', 42, 'ms', { endpoint: '/api/users' });
 * ```
 *
 * @packageDocumentation
 */

// Logger
export { LogDotLogger } from './logger';

// Metrics
export { LogDotMetrics, BoundMetricsClient } from './metrics';

// HTTP client (for advanced usage)
export { HttpClient, BASE_LOGS_URL, BASE_METRICS_URL } from './http';

// Types
export type {
  LogLevel,
  LoggerConfig,
  MetricsConfig,
  BaseConfig,
  LogEntry,
  MetricEntry,
  Entity,
  EntityMetadata,
  CreateEntityOptions,
  RetryConfig,
  HttpResponse,
  // Deprecated
  LogDotConfig,
} from './types';
