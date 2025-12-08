/**
 * LogDot SDK Type Definitions
 */

/** Log severity levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Base configuration options shared by all clients */
export interface BaseConfig {
  /** API key for authentication (format: ilog_live_XXXXX) */
  apiKey: string;
  /** HTTP request timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Maximum retry attempts for failed requests (default: 3) */
  retryAttempts?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  retryDelayMs?: number;
  /** Maximum delay in milliseconds for exponential backoff (default: 30000) */
  retryMaxDelayMs?: number;
  /** Enable debug output to console (default: false) */
  debug?: boolean;
}

/** Configuration options for LogDot Logger */
export interface LoggerConfig extends BaseConfig {
  /** Hostname identifier for logs */
  hostname: string;
}

/** Configuration options for LogDot Metrics */
export interface MetricsConfig extends BaseConfig {
  // No entity-specific config - use forEntity() after creating/finding entity
}

/** @deprecated Use LoggerConfig or MetricsConfig instead */
export interface LogDotConfig extends BaseConfig {
  hostname?: string;
  entityName?: string;
  entityDescription?: string;
}

/** A single log entry */
export interface LogEntry {
  /** Log message content */
  message: string;
  /** Log severity level */
  level: LogLevel;
  /** Optional structured tags/metadata */
  tags?: Record<string, unknown>;
}

/** A single metric entry */
export interface MetricEntry {
  /** Metric name (e.g., 'cpu.usage', 'response_time') */
  name: string;
  /** Numeric value */
  value: number;
  /** Unit of measurement (e.g., 'percent', 'ms', 'bytes') */
  unit: string;
  /** Optional structured tags/metadata */
  tags?: Record<string, unknown>;
}

/** Entity metadata for metrics */
export interface EntityMetadata {
  [key: string]: unknown;
}

/** Entity information returned from create/get operations */
export interface Entity {
  /** Entity ID (UUID) */
  id: string;
  /** Entity name */
  name: string;
  /** Optional entity description */
  description?: string;
}

/** Options for creating an entity */
export interface CreateEntityOptions {
  /** Entity name */
  name: string;
  /** Optional entity description */
  description?: string;
  /** Optional metadata */
  metadata?: EntityMetadata;
}

/** Retry configuration */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
}

/** HTTP response wrapper */
export interface HttpResponse<T = unknown> {
  /** HTTP status code */
  status: number;
  /** Response body data */
  data: T;
}

/** API response for entity operations */
export interface EntityResponse {
  data: {
    id: string;
    name?: string;
    description?: string;
  };
}

/** Batch logs payload */
export interface BatchLogsPayload {
  hostname: string;
  logs: Array<{
    message: string;
    level: string;
    tags?: Record<string, unknown>;
  }>;
}

/** Batch metrics payload */
export interface BatchMetricsPayload {
  entity_id: string;
  name?: string;
  metrics: Array<{
    name?: string;
    value: number;
    unit: string;
    tags?: Record<string, unknown>;
  }>;
}
