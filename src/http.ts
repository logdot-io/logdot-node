/**
 * HTTP Client with retry logic and exponential backoff
 */

import type { RetryConfig, HttpResponse } from './types';

/** Base URLs for LogDot API */
export const BASE_LOGS_URL = 'https://logs.logdot.io/api/v1';
export const BASE_METRICS_URL = 'https://metrics.logdot.io/api/v1';

/** HTTP client configuration */
export interface HttpClientConfig {
  apiKey: string;
  timeout?: number;
  debug?: boolean;
  retry?: Partial<RetryConfig>;
}

/**
 * HTTP Client for LogDot API with automatic retry and exponential backoff
 */
export class HttpClient {
  private apiKey: string;
  private timeout: number;
  private debugEnabled: boolean;
  private retryConfig: RetryConfig;

  constructor(config: HttpClientConfig) {
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 5000;
    this.debugEnabled = config.debug ?? false;
    this.retryConfig = {
      maxAttempts: config.retry?.maxAttempts ?? 3,
      baseDelayMs: config.retry?.baseDelayMs ?? 1000,
      maxDelayMs: config.retry?.maxDelayMs ?? 30000,
    };
  }

  /**
   * Perform a POST request with retry logic
   */
  async post<T = unknown>(url: string, body: unknown): Promise<HttpResponse<T>> {
    return this.executeWithRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        this.log(`POST ${url}`);
        this.log(`Payload: ${JSON.stringify(body)}`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let data: T | null = null;
        const text = await response.text();
        if (text) {
          try {
            data = JSON.parse(text) as T;
          } catch {
            // Response is not JSON
          }
        }

        this.log(`Response status: ${response.status}`);
        if (data) {
          this.log(`Response body: ${JSON.stringify(data)}`);
        }

        return {
          status: response.status,
          data: data as T,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    });
  }

  /**
   * Perform a GET request with retry logic
   */
  async get<T = unknown>(url: string): Promise<HttpResponse<T>> {
    return this.executeWithRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        this.log(`GET ${url}`);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let data: T | null = null;
        const text = await response.text();
        if (text) {
          try {
            data = JSON.parse(text) as T;
          } catch {
            // Response is not JSON
          }
        }

        this.log(`Response status: ${response.status}`);

        return {
          status: response.status,
          data: data as T,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    });
  }

  /**
   * Execute a function with exponential backoff retry
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryConfig.maxAttempts - 1) {
          const delay = this.calculateBackoff(attempt);
          this.log(`Retry ${attempt + 1}/${this.retryConfig.maxAttempts} after ${delay}ms - Error: ${lastError.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Calculate backoff delay with jitter
   */
  private calculateBackoff(attempt: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * delay; // 30% jitter
    return Math.min(delay + jitter, this.retryConfig.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log debug message
   */
  private log(message: string): void {
    if (this.debugEnabled) {
      console.log(`[LogDot] ${message}`);
    }
  }
}
