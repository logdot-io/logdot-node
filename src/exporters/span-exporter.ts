/**
 * LogDot Span Exporter - Converts OpenTelemetry spans to LogDot log entries
 *
 * Implements the OTel SpanExporter interface and uses the existing
 * HttpClient to send batch log entries to the LogDot logs API.
 */

import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { HttpClient, BASE_LOGS_URL } from '../http.js';
import { truncateBytes } from '../utils.js';

export interface LogDotSpanExporterConfig {
  apiKey: string;
  hostname: string;
  debug?: boolean;
  timeout?: number;
}

function spanKindToString(kind: SpanKind): string {
  switch (kind) {
    case SpanKind.SERVER: return 'SERVER';
    case SpanKind.CLIENT: return 'CLIENT';
    case SpanKind.PRODUCER: return 'PRODUCER';
    case SpanKind.CONSUMER: return 'CONSUMER';
    case SpanKind.INTERNAL: return 'INTERNAL';
    default: return 'UNKNOWN';
  }
}

function severityFromStatus(statusCode: SpanStatusCode): string {
  switch (statusCode) {
    case SpanStatusCode.ERROR: return 'error';
    case SpanStatusCode.OK: return 'info';
    default: return 'debug';
  }
}

function hrtimeDurationMs(startTime: [number, number], endTime: [number, number]): number {
  const seconds = endTime[0] - startTime[0];
  const nanos = endTime[1] - startTime[1];
  return Math.round((seconds * 1000 + nanos / 1e6) * 100) / 100;
}

/**
 * Flatten span attributes to simple key-value pairs.
 * Arrays and objects are JSON-stringified.
 */
function flattenAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else {
      result[key] = JSON.stringify(value);
    }
  }
  return result;
}

export class LogDotSpanExporter implements SpanExporter {
  private http: HttpClient;
  private hostname: string;
  private debugEnabled: boolean;

  constructor(config: LogDotSpanExporterConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      timeout: config.timeout ?? 5000,
      debug: config.debug ?? false,
    });
    this.hostname = config.hostname;
    this.debugEnabled = config.debug ?? false;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.doExport(spans)
      .then(() => resultCallback({ code: ExportResultCode.SUCCESS }))
      .catch((err) => {
        this.log(`Export failed: ${err}`);
        resultCallback({ code: ExportResultCode.FAILED, error: err });
      });
  }

  async shutdown(): Promise<void> {
    // No persistent connections to clean up
  }

  async forceFlush(): Promise<void> {
    // No internal buffering; OTel SDK handles batching upstream
  }

  private async doExport(spans: ReadableSpan[]): Promise<void> {
    if (spans.length === 0) return;

    const logs = spans.map((span) => {
      const lib = span.instrumentationLibrary?.name || 'unknown';
      const durationMs = hrtimeDurationMs(span.startTime, span.endTime);
      const severity = severityFromStatus(span.status.code);

      const message = truncateBytes(`[${lib}] ${span.name}`);

      const tags: Record<string, unknown> = {
        trace_id: span.spanContext().traceId,
        span_id: span.spanContext().spanId,
        span_kind: spanKindToString(span.kind),
        duration_ms: durationMs,
        ...flattenAttributes(span.attributes as Record<string, unknown>),
      };

      if (span.parentSpanId) {
        tags.parent_span_id = span.parentSpanId;
      }

      if (span.status.message) {
        tags.status_message = span.status.message;
      }

      return { message, severity, tags };
    });

    const url = `${BASE_LOGS_URL}/logs/batch`;
    const response = await this.http.post(url, {
      hostname: this.hostname,
      logs,
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`LogDot logs batch failed with HTTP ${response.status}`);
    }
  }

  private log(message: string): void {
    if (this.debugEnabled) {
      console.log(`[LogDotSpanExporter] ${message}`);
    }
  }
}
