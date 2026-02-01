import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogDotSpanExporter } from './span-exporter';
import { ExportResultCode } from '@opentelemetry/core';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

// Mock HTTP client
vi.mock('../http', () => ({
  BASE_LOGS_URL: 'https://logs.logdot.io/api/v1',
  HttpClient: vi.fn().mockImplementation(() => ({
    post: vi.fn().mockResolvedValue({ status: 200, data: {} }),
  })),
}));

function makeSpan(overrides: Partial<ReadableSpan> = {}): ReadableSpan {
  return {
    name: 'GET /api/users',
    kind: SpanKind.SERVER,
    spanContext: () => ({
      traceId: 'trace-123',
      spanId: 'span-456',
      traceFlags: 1,
    }),
    startTime: [1000, 0],
    endTime: [1000, 50_000_000], // 50ms
    status: { code: SpanStatusCode.OK },
    attributes: { 'http.method': 'GET', 'http.status_code': 200 },
    instrumentationLibrary: { name: '@opentelemetry/instrumentation-http', version: '1.0.0' },
    parentSpanId: undefined,
    links: [],
    events: [],
    resource: { attributes: {} },
    duration: [0, 50_000_000],
    ended: true,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    ...overrides,
  } as unknown as ReadableSpan;
}

describe('LogDotSpanExporter', () => {
  let exporter: LogDotSpanExporter;

  beforeEach(() => {
    vi.clearAllMocks();
    exporter = new LogDotSpanExporter({
      apiKey: 'test_key',
      hostname: 'test-service',
    });
  });

  describe('export', () => {
    it('should call resultCallback with SUCCESS on successful export', async () => {
      const callback = vi.fn();
      const spans = [makeSpan()];

      exporter.export(spans, callback);
      // Wait for async export
      await new Promise((r) => setTimeout(r, 50));

      expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    });

    it('should skip export for empty spans array', async () => {
      const callback = vi.fn();

      exporter.export([], callback);
      await new Promise((r) => setTimeout(r, 50));

      expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    });

    it('should map SpanStatusCode.ERROR to error severity', async () => {
      const callback = vi.fn();
      const spans = [
        makeSpan({
          status: { code: SpanStatusCode.ERROR, message: 'failed' },
        }),
      ];

      exporter.export(spans, callback);
      await new Promise((r) => setTimeout(r, 50));

      // Verify the HTTP client was called with error severity
      const http = (exporter as any).http;
      expect(http.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          hostname: 'test-service',
          logs: expect.arrayContaining([
            expect.objectContaining({ severity: 'error' }),
          ]),
        }),
      );
    });

    it('should map SpanStatusCode.OK to info severity', async () => {
      const callback = vi.fn();
      const spans = [makeSpan({ status: { code: SpanStatusCode.OK } })];

      exporter.export(spans, callback);
      await new Promise((r) => setTimeout(r, 50));

      const http = (exporter as any).http;
      expect(http.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({ severity: 'info' }),
          ]),
        }),
      );
    });

    it('should map SpanStatusCode.UNSET to debug severity', async () => {
      const callback = vi.fn();
      const spans = [makeSpan({ status: { code: SpanStatusCode.UNSET } })];

      exporter.export(spans, callback);
      await new Promise((r) => setTimeout(r, 50));

      const http = (exporter as any).http;
      expect(http.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({ severity: 'debug' }),
          ]),
        }),
      );
    });

    it('should include trace_id and span_id in tags', async () => {
      const callback = vi.fn();
      exporter.export([makeSpan()], callback);
      await new Promise((r) => setTimeout(r, 50));

      const http = (exporter as any).http;
      const call = http.post.mock.calls[0];
      const logs = call[1].logs;

      expect(logs[0].tags.trace_id).toBe('trace-123');
      expect(logs[0].tags.span_id).toBe('span-456');
    });

    it('should include duration_ms in tags', async () => {
      const callback = vi.fn();
      exporter.export([makeSpan()], callback);
      await new Promise((r) => setTimeout(r, 50));

      const http = (exporter as any).http;
      const logs = http.post.mock.calls[0][1].logs;

      expect(logs[0].tags.duration_ms).toBeTypeOf('number');
    });

    it('should flatten span attributes into tags', async () => {
      const callback = vi.fn();
      exporter.export([makeSpan()], callback);
      await new Promise((r) => setTimeout(r, 50));

      const http = (exporter as any).http;
      const logs = http.post.mock.calls[0][1].logs;

      expect(logs[0].tags['http.method']).toBe('GET');
      expect(logs[0].tags['http.status_code']).toBe(200);
    });

    it('should format message as [library] span.name', async () => {
      const callback = vi.fn();
      exporter.export([makeSpan()], callback);
      await new Promise((r) => setTimeout(r, 50));

      const http = (exporter as any).http;
      const logs = http.post.mock.calls[0][1].logs;

      expect(logs[0].message).toBe('[@opentelemetry/instrumentation-http] GET /api/users');
    });
  });

  describe('shutdown', () => {
    it('should resolve without error', async () => {
      await expect(exporter.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('forceFlush', () => {
    it('should resolve without error', async () => {
      await expect(exporter.forceFlush()).resolves.toBeUndefined();
    });
  });
});
