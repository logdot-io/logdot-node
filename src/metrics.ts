/**
 * LogDot Metrics - Handles metrics transmission to LogDot cloud
 *
 * @example
 * ```typescript
 * // Create metrics client
 * const metrics = new LogDotMetrics({ apiKey: 'ilog_live_YOUR_API_KEY' });
 *
 * // Create or find an entity
 * const entity = await metrics.createEntity({
 *   name: 'my-service',
 *   description: 'My production service'
 * });
 *
 * // Bind to the entity for sending metrics
 * const client = metrics.forEntity(entity.id);
 *
 * // Send metrics
 * await client.send('cpu.usage', 45.5, 'percent');
 * await client.send('memory.used', 1024, 'MB', { host: 'server-1' });
 * ```
 */

import { HttpClient, BASE_METRICS_URL } from './http';
import type {
  MetricsConfig,
  MetricEntry,
  EntityMetadata,
  EntityResponse,
  Entity,
  CreateEntityOptions,
} from './types';

/** API endpoints */
const ENDPOINT_ENTITIES = '/entities';
const ENDPOINT_ENTITIES_BY_NAME = '/entities/by-name';
const ENDPOINT_SINGLE = '/metrics';
const ENDPOINT_BATCH = '/metrics/batch';

/**
 * Convert tags object to array of "key:value" strings
 */
function formatTags(tags?: Record<string, unknown>): string[] | undefined {
  if (!tags || Object.keys(tags).length === 0) {
    return undefined;
  }
  return Object.entries(tags).map(([key, value]) => `${key}:${value}`);
}

/**
 * Bound metrics client for sending metrics to a specific entity
 */
export class BoundMetricsClient {
  private http: HttpClient;
  private entityId: string;
  private debugEnabled: boolean;

  private batchMode: boolean = false;
  private multiBatchMode: boolean = false;
  private batchMetricName: string = '';
  private batchUnit: string = '';
  private batchQueue: MetricEntry[] = [];
  private lastError: string = '';
  private lastHttpCode: number = -1;

  /** @internal */
  constructor(http: HttpClient, entityId: string, debug: boolean = false) {
    this.http = http;
    this.entityId = entityId;
    this.debugEnabled = debug;
  }

  /**
   * Get the entity ID this client is bound to
   */
  getEntityId(): string {
    return this.entityId;
  }

  /**
   * Send a single metric
   */
  async send(
    name: string,
    value: number,
    unit: string,
    tags?: Record<string, unknown>
  ): Promise<boolean> {
    if (this.batchMode) {
      this.lastError = 'Cannot use send() in batch mode. Use add() or addMetric() instead.';
      return false;
    }

    try {
      const payload: Record<string, unknown> = {
        entity_id: this.entityId,
        name,
        value,
        unit,
      };

      const formattedTags = formatTags(tags);
      if (formattedTags) {
        payload.tags = formattedTags;
      }

      const url = `${BASE_METRICS_URL}${ENDPOINT_SINGLE}`;
      const response = await this.http.post(url, payload);

      this.lastHttpCode = response.status;

      if (response.status === 200 || response.status === 201) {
        this.lastError = '';
        return true;
      }

      this.lastError = `HTTP ${response.status}`;
      return false;
    } catch (error) {
      this.lastError = (error as Error).message;
      return false;
    }
  }

  /**
   * Begin single-metric batch mode
   * All add() calls will use the same metric name and unit
   */
  beginBatch(metricName: string, unit: string): void {
    this.batchMode = true;
    this.multiBatchMode = false;
    this.batchMetricName = metricName;
    this.batchUnit = unit;
    this.clearBatch();
  }

  /**
   * Add a value to the single-metric batch
   */
  add(value: number, tags?: Record<string, unknown>): boolean {
    if (!this.batchMode || this.multiBatchMode) {
      this.lastError = 'Not in single-metric batch mode. Call beginBatch() first.';
      return false;
    }

    this.batchQueue.push({
      name: this.batchMetricName,
      value,
      unit: this.batchUnit,
      tags,
    });

    return true;
  }

  /**
   * Begin multi-metric batch mode
   * Allows adding different metrics to the same batch
   */
  beginMultiBatch(): void {
    this.batchMode = true;
    this.multiBatchMode = true;
    this.clearBatch();
  }

  /**
   * Add a metric to the multi-metric batch
   */
  addMetric(
    name: string,
    value: number,
    unit: string,
    tags?: Record<string, unknown>
  ): boolean {
    if (!this.multiBatchMode) {
      this.lastError = 'Not in multi-metric batch mode. Call beginMultiBatch() first.';
      return false;
    }

    this.batchQueue.push({ name, value, unit, tags });
    return true;
  }

  /**
   * Send all queued metrics in a single batch request
   */
  async sendBatch(): Promise<boolean> {
    if (!this.batchMode || this.batchQueue.length === 0) {
      return false;
    }

    try {
      const formattedMetrics = this.batchQueue.map(entry => {
        const metric: Record<string, unknown> = {
          value: entry.value,
          unit: entry.unit,
        };
        if (this.multiBatchMode) {
          metric.name = entry.name;
        }
        const formattedTags = formatTags(entry.tags);
        if (formattedTags) {
          metric.tags = formattedTags;
        }
        return metric;
      });

      const payload: Record<string, unknown> = {
        entity_id: this.entityId,
        metrics: formattedMetrics,
      };

      // For single-metric batch, include the metric name at top level
      if (!this.multiBatchMode) {
        payload.name = this.batchMetricName;
      }

      const url = `${BASE_METRICS_URL}${ENDPOINT_BATCH}`;
      const response = await this.http.post(url, payload);

      this.lastHttpCode = response.status;

      if (response.status === 200 || response.status === 201) {
        this.lastError = '';
        this.clearBatch();
        return true;
      }

      this.lastError = `HTTP ${response.status}`;
      return false;
    } catch (error) {
      this.lastError = (error as Error).message;
      return false;
    }
  }

  /**
   * End batch mode and clear the queue
   */
  endBatch(): void {
    this.batchMode = false;
    this.multiBatchMode = false;
    this.clearBatch();
  }

  /**
   * Clear the batch queue without sending
   */
  clearBatch(): void {
    this.batchQueue = [];
  }

  /**
   * Get the current batch queue size
   */
  getBatchSize(): number {
    return this.batchQueue.length;
  }

  /**
   * Get the last error message
   */
  getLastError(): string {
    return this.lastError;
  }

  /**
   * Get the last HTTP response code
   */
  getLastHttpCode(): number {
    return this.lastHttpCode;
  }

  /**
   * Enable or disable debug output
   */
  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }
}

/**
 * LogDot Metrics client for entity management and metrics transmission
 *
 * This is the main entry point for the metrics API. Use it to:
 * 1. Create or find entities
 * 2. Get a bound client with forEntity() to send metrics
 *
 * @example
 * ```typescript
 * const metrics = new LogDotMetrics({ apiKey: 'ilog_live_YOUR_API_KEY' });
 *
 * // Create a new entity
 * const entity = await metrics.createEntity({
 *   name: 'my-service',
 *   description: 'Production service'
 * });
 *
 * // Or find an existing entity
 * const existing = await metrics.getEntityByName('my-service');
 *
 * // Get a bound client for sending metrics
 * const client = metrics.forEntity(entity.id);
 * await client.send('response_time', 42, 'ms');
 * ```
 */
export class LogDotMetrics {
  private http: HttpClient;
  private debugEnabled: boolean;
  private lastError: string = '';
  private lastHttpCode: number = -1;

  /**
   * Create a new LogDot Metrics client
   *
   * @param config - Metrics configuration (apiKey required)
   */
  constructor(config: MetricsConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      timeout: config.timeout,
      debug: config.debug,
      retry: {
        maxAttempts: config.retryAttempts,
        baseDelayMs: config.retryDelayMs,
        maxDelayMs: config.retryMaxDelayMs,
      },
    });
    this.debugEnabled = config.debug ?? false;
  }

  /**
   * Create a new entity
   *
   * @param options - Entity creation options (name, description, metadata)
   * @returns The created entity, or null if creation failed
   *
   * @example
   * ```typescript
   * const entity = await metrics.createEntity({
   *   name: 'my-service',
   *   description: 'My production service',
   *   metadata: { version: '1.0.0', region: 'us-east-1' }
   * });
   * ```
   */
  async createEntity(options: CreateEntityOptions): Promise<Entity | null> {
    try {
      const payload: Record<string, unknown> = {
        name: options.name,
      };

      if (options.description) {
        payload.description = options.description;
      }

      if (options.metadata && Object.keys(options.metadata).length > 0) {
        payload.metadata = options.metadata;
      }

      const url = `${BASE_METRICS_URL}${ENDPOINT_ENTITIES}`;
      const response = await this.http.post<EntityResponse>(url, payload);

      this.lastHttpCode = response.status;

      if ((response.status === 200 || response.status === 201) && response.data?.data?.id) {
        this.lastError = '';
        this.debugLog(`Entity created: ${response.data.data.id}`);
        return {
          id: response.data.data.id,
          name: options.name,
          description: options.description,
        };
      }

      this.lastError = `Failed to create entity. HTTP ${response.status}`;
      return null;
    } catch (error) {
      this.lastError = (error as Error).message;
      return null;
    }
  }

  /**
   * Get an entity by name
   *
   * @param name - Entity name to look up
   * @returns The entity if found, or null if not found
   *
   * @example
   * ```typescript
   * const entity = await metrics.getEntityByName('my-service');
   * if (entity) {
   *   const client = metrics.forEntity(entity.id);
   *   await client.send('cpu', 50, 'percent');
   * }
   * ```
   */
  async getEntityByName(name: string): Promise<Entity | null> {
    try {
      const url = `${BASE_METRICS_URL}${ENDPOINT_ENTITIES_BY_NAME}/${encodeURIComponent(name)}`;
      const response = await this.http.get<EntityResponse>(url);

      this.lastHttpCode = response.status;

      if (response.status === 200 && response.data?.data?.id) {
        this.lastError = '';
        this.debugLog(`Entity found: ${response.data.data.id}`);
        return {
          id: response.data.data.id,
          name: response.data.data.name || name,
          description: response.data.data.description,
        };
      }

      this.lastError = `Entity not found. HTTP ${response.status}`;
      return null;
    } catch (error) {
      this.lastError = (error as Error).message;
      return null;
    }
  }

  /**
   * Get or create an entity by name
   *
   * @param options - Entity options (will create if not found)
   * @returns The entity (existing or newly created), or null on error
   *
   * @example
   * ```typescript
   * const entity = await metrics.getOrCreateEntity({
   *   name: 'my-service',
   *   description: 'Created if not exists'
   * });
   * ```
   */
  async getOrCreateEntity(options: CreateEntityOptions): Promise<Entity | null> {
    // Try to find existing entity first
    const existing = await this.getEntityByName(options.name);
    if (existing) {
      return existing;
    }

    // Create new entity
    return this.createEntity(options);
  }

  /**
   * Create a bound metrics client for a specific entity
   *
   * @param entityId - The entity ID to bind to
   * @returns A BoundMetricsClient for sending metrics to this entity
   *
   * @example
   * ```typescript
   * const entity = await metrics.createEntity({ name: 'my-service' });
   * const client = metrics.forEntity(entity.id);
   *
   * await client.send('cpu.usage', 45, 'percent');
   * await client.send('memory.used', 1024, 'MB');
   * ```
   */
  forEntity(entityId: string): BoundMetricsClient {
    return new BoundMetricsClient(this.http, entityId, this.debugEnabled);
  }

  /**
   * Get the last error message
   */
  getLastError(): string {
    return this.lastError;
  }

  /**
   * Get the last HTTP response code
   */
  getLastHttpCode(): number {
    return this.lastHttpCode;
  }

  /**
   * Enable or disable debug output
   */
  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Log debug message to console
   */
  private debugLog(message: string): void {
    if (this.debugEnabled) {
      console.log(`[LogDotMetrics] ${message}`);
    }
  }
}
