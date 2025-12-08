/**
 * LogDot Logger - Handles log transmission to LogDot cloud
 */

import { HttpClient, BASE_LOGS_URL } from './http';
import type { LoggerConfig, LogLevel, LogEntry } from './types';

/** API endpoints */
const ENDPOINT_SINGLE = '/logs';
const ENDPOINT_BATCH = '/logs/batch';

/**
 * LogDot Logger class for sending logs to LogDot cloud
 */
export class LogDotLogger {
  private http: HttpClient;
  private hostname: string;
  private debugEnabled: boolean;
  private batchMode: boolean = false;
  private batchQueue: LogEntry[] = [];
  private context: Record<string, unknown> = {};
  private config: LoggerConfig;

  /**
   * Create a new LogDot Logger
   *
   * @param config - Logger configuration
   * @param context - Optional initial context for all logs
   *
   * @example
   * ```typescript
   * const logger = new LogDotLogger({
   *   apiKey: 'ilog_live_YOUR_API_KEY',
   *   hostname: 'my-service',
   * });
   *
   * await logger.info('Application started');
   * await logger.error('Something went wrong', { error_code: 500 });
   * ```
   */
  constructor(config: LoggerConfig, context: Record<string, unknown> = {}) {
    this.config = config;
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
    this.hostname = config.hostname;
    this.debugEnabled = config.debug ?? false;
    this.context = context;
  }

  /**
   * Create a new logger with additional context that will be merged with all log tags
   *
   * @param context - Object containing key-value pairs to add to all logs
   * @returns A new LogDotLogger instance with the merged context
   *
   * @example
   * ```typescript
   * const logger = new LogDotLogger(config);
   * const userLogger = logger.withContext({ user_id: 123, session_id: 'abc' });
   * await userLogger.info('User action'); // Will include user_id and session_id
   * ```
   */
  withContext(context: Record<string, unknown>): LogDotLogger {
    const mergedContext = { ...this.context, ...context };
    return new LogDotLogger(this.config, mergedContext);
  }

  /**
   * Get the current context
   */
  getContext(): Record<string, unknown> {
    return { ...this.context };
  }

  /**
   * Merge context with provided tags (tags take precedence)
   */
  private mergeTags(tags?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (Object.keys(this.context).length === 0 && !tags) {
      return undefined;
    }
    return { ...this.context, ...tags };
  }

  /**
   * Send a debug level log
   */
  async debug(message: string, tags?: Record<string, unknown>): Promise<boolean> {
    return this.log('debug', message, tags);
  }

  /**
   * Send an info level log
   */
  async info(message: string, tags?: Record<string, unknown>): Promise<boolean> {
    return this.log('info', message, tags);
  }

  /**
   * Send a warning level log
   */
  async warn(message: string, tags?: Record<string, unknown>): Promise<boolean> {
    return this.log('warn', message, tags);
  }

  /**
   * Send an error level log
   */
  async error(message: string, tags?: Record<string, unknown>): Promise<boolean> {
    return this.log('error', message, tags);
  }

  /**
   * Send a log at the specified level
   */
  async log(level: LogLevel, message: string, tags?: Record<string, unknown>): Promise<boolean> {
    const mergedTags = this.mergeTags(tags);
    const entry: LogEntry = { message, level, tags: mergedTags };

    if (this.batchMode) {
      this.batchQueue.push(entry);
      return true;
    }

    return this.sendLog(entry);
  }

  /**
   * Begin batch mode - logs will be queued instead of sent immediately
   */
  beginBatch(): void {
    this.batchMode = true;
    this.clearBatch();
  }

  /**
   * Send all queued logs in a single batch request
   */
  async sendBatch(): Promise<boolean> {
    if (!this.batchMode || this.batchQueue.length === 0) {
      return false;
    }

    try {
      const payload = {
        hostname: this.hostname,
        logs: this.batchQueue.map(entry => ({
          message: entry.message,
          severity: entry.level,
          ...(entry.tags && Object.keys(entry.tags).length > 0 ? { tags: entry.tags } : {}),
        })),
      };

      const url = `${BASE_LOGS_URL}${ENDPOINT_BATCH}`;
      const response = await this.http.post(url, payload);

      if (response.status === 200 || response.status === 201) {
        this.clearBatch();
        return true;
      }

      this.debugLog(`Failed to send batch. HTTP code: ${response.status}`);
      return false;
    } catch (error) {
      this.debugLog(`Failed to send batch: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * End batch mode and clear the queue
   */
  endBatch(): void {
    this.batchMode = false;
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
   * Get the configured hostname
   */
  getHostname(): string {
    return this.hostname;
  }

  /**
   * Enable or disable debug output
   */
  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Send a single log entry
   */
  private async sendLog(entry: LogEntry): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        message: entry.message,
        severity: entry.level,
        hostname: this.hostname,
      };

      if (entry.tags && Object.keys(entry.tags).length > 0) {
        payload.tags = entry.tags;
      }

      const url = `${BASE_LOGS_URL}${ENDPOINT_SINGLE}`;
      const response = await this.http.post(url, payload);

      if (response.status === 200 || response.status === 201) {
        return true;
      }

      this.debugLog(`Failed to send log. HTTP code: ${response.status}`);
      return false;
    } catch (error) {
      this.debugLog(`Failed to send log: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Log debug message to console
   */
  private debugLog(message: string): void {
    if (this.debugEnabled) {
      console.log(`[LogDotLogger] ${message}`);
    }
  }
}
