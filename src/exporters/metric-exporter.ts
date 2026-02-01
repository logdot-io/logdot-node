/**
 * LogDot Metric Exporter - Converts OpenTelemetry metrics to LogDot metric entries
 *
 * Implements the OTel PushMetricExporter interface and uses the existing
 * HttpClient to send batch metric entries to the LogDot metrics API.
 */

import type {
  PushMetricExporter,
  ResourceMetrics,
  MetricData,
} from '@opentelemetry/sdk-metrics';
import { DataPointType } from '@opentelemetry/sdk-metrics';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import { HttpClient, BASE_METRICS_URL } from '../http.js';

export interface LogDotMetricExporterConfig {
  apiKey: string;
  entityName: string;
  debug?: boolean;
  timeout?: number;
}

interface LogDotMetricPayload {
  name: string;
  value: number;
  unit: string;
  tags?: string[];
}

/**
 * Format OTel attributes as logdot metric tags: ["key:value", ...]
 */
function formatTags(attributes: Record<string, unknown>): string[] | undefined {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return undefined;
  return entries
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}:${v}`);
}

export class LogDotMetricExporter implements PushMetricExporter {
  private http: HttpClient;
  private entityName: string;
  private entityId: string | null = null;
  private entityPromise: Promise<void> | null = null;
  private debugEnabled: boolean;

  constructor(config: LogDotMetricExporterConfig) {
    this.http = new HttpClient({
      apiKey: config.apiKey,
      timeout: config.timeout ?? 5000,
      debug: config.debug ?? false,
    });
    this.entityName = config.entityName;
    this.debugEnabled = config.debug ?? false;
  }

  export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
    this.doExport(metrics)
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
    // No internal buffering
  }

  selectAggregationTemporality(_instrumentType: unknown): 0 {
    // DELTA temporality (AggregationTemporality.DELTA = 0)
    return 0;
  }

  private async doExport(resourceMetrics: ResourceMetrics): Promise<void> {
    await this.ensureEntity();
    if (!this.entityId) {
      this.log('No entity ID available, skipping metric export');
      return;
    }

    const payloads: LogDotMetricPayload[] = [];

    for (const scopeMetrics of resourceMetrics.scopeMetrics) {
      for (const metricData of scopeMetrics.metrics) {
        const converted = this.convertMetricData(metricData);
        payloads.push(...converted);
      }
    }

    if (payloads.length === 0) return;

    const url = `${BASE_METRICS_URL}/metrics/batch`;
    const response = await this.http.post(url, {
      entity_id: this.entityId,
      metrics: payloads,
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`LogDot metrics batch failed with HTTP ${response.status}`);
    }
  }

  private convertMetricData(metricData: MetricData): LogDotMetricPayload[] {
    const results: LogDotMetricPayload[] = [];
    const baseName = metricData.descriptor.name;
    const unit = metricData.descriptor.unit || '1';

    switch (metricData.dataPointType) {
      case DataPointType.GAUGE:
      case DataPointType.SUM:
        for (const point of metricData.dataPoints) {
          const value = typeof point.value === 'number' ? point.value : 0;
          // Skip negative values (API requires >= 0)
          if (value < 0) continue;
          const tags = formatTags(point.attributes as Record<string, unknown>);
          results.push({ name: baseName, value, unit, ...(tags ? { tags } : {}) });
        }
        break;

      case DataPointType.HISTOGRAM:
        for (const point of metricData.dataPoints) {
          const hist = point.value as { sum?: number; count?: number; min?: number; max?: number };
          const tags = formatTags(point.attributes as Record<string, unknown>);
          const tagObj = tags ? { tags } : {};

          if (hist.count !== undefined && hist.count > 0) {
            results.push({ name: `${baseName}.count`, value: hist.count, unit: '1', ...tagObj });

            if (hist.sum !== undefined) {
              const avg = hist.sum / hist.count;
              if (avg >= 0) {
                results.push({ name: `${baseName}.avg`, value: Math.round(avg * 100) / 100, unit, ...tagObj });
              }
            }
          }

          if (hist.min !== undefined && hist.min >= 0) {
            results.push({ name: `${baseName}.min`, value: hist.min, unit, ...tagObj });
          }

          if (hist.max !== undefined && hist.max >= 0) {
            results.push({ name: `${baseName}.max`, value: hist.max, unit, ...tagObj });
          }
        }
        break;
    }

    return results;
  }

  private async ensureEntity(): Promise<void> {
    // Use a shared promise so concurrent calls wait on the same resolution
    if (!this.entityPromise) {
      this.entityPromise = this.resolveEntity();
    }
    return this.entityPromise;
  }

  private async resolveEntity(): Promise<void> {
    try {
      // Try to find existing entity
      const getUrl = `${BASE_METRICS_URL}/entities/by-name/${encodeURIComponent(this.entityName)}`;
      const getResponse = await this.http.get<{ data?: { id?: string } }>(getUrl);

      if (getResponse.status === 200 && getResponse.data?.data?.id) {
        this.entityId = getResponse.data.data.id;
        this.log(`Found entity: ${this.entityId}`);
        return;
      }

      // Create new entity
      const createUrl = `${BASE_METRICS_URL}/entities`;
      const createResponse = await this.http.post<{ data?: { id?: string } }>(createUrl, {
        name: this.entityName,
        description: `Auto-instrumented: ${this.entityName}`,
      });

      if ((createResponse.status === 200 || createResponse.status === 201) && createResponse.data?.data?.id) {
        this.entityId = createResponse.data.data.id;
        this.log(`Created entity: ${this.entityId}`);
      }
    } catch (err) {
      this.log(`Entity resolution failed: ${err}`);
      // Reset so next export attempt retries entity resolution
      this.entityPromise = null;
    }
  }

  private log(message: string): void {
    if (this.debugEnabled) {
      console.log(`[LogDotMetricExporter] ${message}`);
    }
  }
}
