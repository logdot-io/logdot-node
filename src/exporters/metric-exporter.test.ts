import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogDotMetricExporter } from './metric-exporter';
import { ExportResultCode } from '@opentelemetry/core';
import { DataPointType } from '@opentelemetry/sdk-metrics';
import type { ResourceMetrics } from '@opentelemetry/sdk-metrics';

// Mock HTTP client
const mockPost = vi.fn().mockResolvedValue({ status: 200, data: {} });
const mockGet = vi.fn().mockResolvedValue({
  status: 200,
  data: { data: { id: 'entity-uuid-123' } },
});

vi.mock('../http', () => ({
  BASE_METRICS_URL: 'https://metrics.logdot.io/api/v1',
  HttpClient: vi.fn().mockImplementation(() => ({
    post: mockPost,
    get: mockGet,
  })),
}));

function makeResourceMetrics(
  dataPoints: Array<{
    value: number | { sum?: number; count?: number; min?: number; max?: number };
    attributes?: Record<string, unknown>;
  }> = [],
  options: {
    name?: string;
    unit?: string;
    dataPointType?: DataPointType;
  } = {},
): ResourceMetrics {
  return {
    resource: { attributes: {} },
    scopeMetrics: [
      {
        scope: { name: 'test' },
        metrics: [
          {
            descriptor: {
              name: options.name ?? 'http.request.duration',
              unit: options.unit ?? 'ms',
              description: '',
              type: '',
              valueType: 0,
            },
            dataPointType: options.dataPointType ?? DataPointType.GAUGE,
            dataPoints: dataPoints.map((dp) => ({
              value: dp.value,
              attributes: dp.attributes ?? {},
              startTime: [0, 0],
              endTime: [0, 0],
            })),
          },
        ],
      },
    ],
  } as unknown as ResourceMetrics;
}

describe('LogDotMetricExporter', () => {
  let exporter: LogDotMetricExporter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ status: 200, data: {} });
    mockGet.mockResolvedValue({
      status: 200,
      data: { data: { id: 'entity-uuid-123' } },
    });

    exporter = new LogDotMetricExporter({
      apiKey: 'test_key',
      entityName: 'test-entity',
    });
  });

  describe('export', () => {
    it('should resolve entity on first export', async () => {
      const callback = vi.fn();
      const metrics = makeResourceMetrics([{ value: 42 }]);

      exporter.export(metrics, callback);
      await new Promise((r) => setTimeout(r, 50));

      expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
      // Should have called GET for entity lookup
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('/entities/by-name/test-entity'),
      );
    });

    it('should create entity if not found', async () => {
      mockGet.mockResolvedValueOnce({ status: 404, data: null });
      mockPost
        .mockResolvedValueOnce({
          status: 201,
          data: { data: { id: 'new-entity-123' } },
        })
        .mockResolvedValue({ status: 200, data: {} });

      const callback = vi.fn();
      exporter.export(makeResourceMetrics([{ value: 42 }]), callback);
      await new Promise((r) => setTimeout(r, 50));

      expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
      // First POST creates entity, second POST sends metrics
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/entities'),
        expect.objectContaining({ name: 'test-entity' }),
      );
    });

    it('should skip negative metric values', async () => {
      const callback = vi.fn();
      const metrics = makeResourceMetrics([
        { value: 10 },
        { value: -5 },
        { value: 20 },
      ]);

      exporter.export(metrics, callback);
      await new Promise((r) => setTimeout(r, 50));

      // Find the metrics batch POST (not the entity GET)
      const metricsCalls = mockPost.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/metrics/batch'),
      );
      expect(metricsCalls.length).toBe(1);
      expect(metricsCalls[0][1].metrics.length).toBe(2); // -5 was skipped
    });

    it('should handle GAUGE data points', async () => {
      const callback = vi.fn();
      const metrics = makeResourceMetrics(
        [{ value: 45.5, attributes: { endpoint: '/api' } }],
        { name: 'cpu_usage', unit: 'percent', dataPointType: DataPointType.GAUGE },
      );

      exporter.export(metrics, callback);
      await new Promise((r) => setTimeout(r, 50));

      const metricsCalls = mockPost.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/metrics/batch'),
      );
      expect(metricsCalls.length).toBe(1);
      const payload = metricsCalls[0][1];
      expect(payload.metrics[0]).toEqual({
        name: 'cpu_usage',
        value: 45.5,
        unit: 'percent',
        tags: ['endpoint:/api'],
      });
    });

    it('should handle HISTOGRAM data points', async () => {
      const callback = vi.fn();
      const metrics = makeResourceMetrics(
        [
          {
            value: { sum: 100, count: 4, min: 10, max: 40 },
          },
        ],
        {
          name: 'request.duration',
          unit: 'ms',
          dataPointType: DataPointType.HISTOGRAM,
        },
      );

      exporter.export(metrics, callback);
      await new Promise((r) => setTimeout(r, 50));

      const metricsCalls = mockPost.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/metrics/batch'),
      );
      expect(metricsCalls.length).toBe(1);
      const names = metricsCalls[0][1].metrics.map((m: { name: string }) => m.name);
      expect(names).toContain('request.duration.count');
      expect(names).toContain('request.duration.avg');
      expect(names).toContain('request.duration.min');
      expect(names).toContain('request.duration.max');
    });

    it('should reuse entity on subsequent exports', async () => {
      const callback = vi.fn();
      exporter.export(makeResourceMetrics([{ value: 1 }]), callback);
      await new Promise((r) => setTimeout(r, 50));

      exporter.export(makeResourceMetrics([{ value: 2 }]), callback);
      await new Promise((r) => setTimeout(r, 50));

      // Entity GET should only happen once
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('should format tags as key:value strings', async () => {
      const callback = vi.fn();
      const metrics = makeResourceMetrics([
        { value: 42, attributes: { method: 'GET', status: 200 } },
      ]);

      exporter.export(metrics, callback);
      await new Promise((r) => setTimeout(r, 50));

      const metricsCalls = mockPost.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/metrics/batch'),
      );
      expect(metricsCalls[0][1].metrics[0].tags).toEqual(['method:GET', 'status:200']);
    });
  });

  describe('selectAggregationTemporality', () => {
    it('should return DELTA (0)', () => {
      expect(exporter.selectAggregationTemporality(0)).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should resolve without error', async () => {
      await expect(exporter.shutdown()).resolves.toBeUndefined();
    });
  });
});
