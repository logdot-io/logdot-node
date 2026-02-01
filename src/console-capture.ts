/**
 * Console Capture - Intercepts console.log/warn/error/debug and sends to LogDot
 *
 * Buffers log entries and flushes them periodically to avoid
 * one HTTP request per console call. Includes a recursion guard
 * to prevent infinite loops when HttpClient itself logs.
 */

import { HttpClient, BASE_LOGS_URL } from './http.js';
import { truncateBytes } from './utils.js';
import type { LogLevel } from './types.js';

const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BUFFER_SIZE = 100;

interface BufferedLog {
  message: string;
  severity: LogLevel;
  tags: Record<string, unknown>;
}

export interface ConsoleCaptureConfig {
  apiKey: string;
  hostname: string;
  debug?: boolean;
  timeout?: number;
  /** Flush interval in ms (default: 5000) */
  flushIntervalMs?: number;
  /** Max buffer size before auto-flush (default: 100) */
  maxBufferSize?: number;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

const LEVEL_MAP: Record<string, LogLevel> = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
};

export class ConsoleCapture {
  private http: HttpClient;
  private hostname: string;
  private buffer: BufferedLog[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private maxBufferSize: number;
  private flushing = false;

  private originals: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };

  constructor(config: ConsoleCaptureConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      timeout: config.timeout ?? 5000,
      debug: false, // Never debug the capture client itself
    });
    this.hostname = config.hostname;
    this.maxBufferSize = config.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;

    // Save originals before patching
    this.originals = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    this.patch();

    const timer = setInterval(
      () => this.flush(),
      config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    );
    // Unref so the timer doesn't keep the process alive in scripts/tests
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    this.flushTimer = timer;
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Flush remaining buffer before restoring originals, so that
    // the recursion guard (which depends on patched methods) still works
    this.flush();
    this.restore();
  }

  private patch(): void {
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;

    for (const method of methods) {
      const original = this.originals[method];
      const severity = LEVEL_MAP[method];

      console[method] = (...args: unknown[]) => {
        // Always call original so stdout/stderr still works
        original.apply(console, args);

        // Guard: skip only re-entrant calls from inside flush().
        // New entries from user code are still buffered normally.
        if (this.flushing) return;

        const message = truncateBytes(formatArgs(args));
        this.buffer.push({
          message,
          severity,
          tags: { source: 'console' },
        });

        if (this.buffer.length >= this.maxBufferSize) {
          this.flush();
        }
      };
    }
  }

  private restore(): void {
    console.log = this.originals.log;
    console.info = this.originals.info;
    console.warn = this.originals.warn;
    console.error = this.originals.error;
    console.debug = this.originals.debug;
  }

  private flush(): void {
    if (this.buffer.length === 0 || this.flushing) return;

    const logs = this.buffer.splice(0);
    this.flushing = true;

    const url = `${BASE_LOGS_URL}/logs/batch`;
    this.http
      .post(url, {
        hostname: this.hostname,
        logs: logs.map((l) => ({
          message: l.message,
          severity: l.severity,
          tags: l.tags,
        })),
      })
      .catch(() => {
        // Best-effort — don't re-queue to avoid unbounded growth
      })
      .finally(() => {
        this.flushing = false;
      });
  }
}
