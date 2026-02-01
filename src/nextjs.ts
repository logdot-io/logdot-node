/**
 * LogDot Auto-Instrumentation for Next.js
 *
 * Uses OpenTelemetry to automatically capture HTTP requests, fetch calls,
 * database queries, and errors — sending them to LogDot as logs and metrics.
 *
 * @example
 * ```typescript
 * // instrumentation.ts (Next.js project root)
 * export async function register() {
 *   const { init } = await import('@logdot-io/sdk/nextjs');
 *   init({
 *     apiKey: 'ilog_live_YOUR_API_KEY',
 *     hostname: 'my-nextjs-app',
 *   });
 * }
 * ```
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { metrics } from '@opentelemetry/api';
import { LogDotSpanExporter } from './exporters/span-exporter.js';
import { LogDotMetricExporter } from './exporters/metric-exporter.js';
import { ConsoleCapture } from './console-capture.js';

/** Configuration for Next.js auto-instrumentation */
export interface NextjsInitConfig {
  /** API key for authentication (format: ilog_live_XXXXX) */
  apiKey: string;
  /** Hostname identifier for logs */
  hostname: string;
  /** Metrics entity name (defaults to hostname) */
  entityName?: string;
  /** Enable debug output to console (default: false) */
  debug?: boolean;
  /** HTTP timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Capture console.log/warn/error/debug and send to LogDot (default: false) */
  captureConsole?: boolean;
}

let sdkInstance: NodeSDK | null = null;
let meterProviderInstance: MeterProvider | null = null;
let consoleCaptureInstance: ConsoleCapture | null = null;

/**
 * Initialize LogDot auto-instrumentation for Next.js.
 *
 * Call this inside your `instrumentation.ts` register function.
 * It sets up OpenTelemetry with custom exporters that send data
 * to LogDot's logs and metrics APIs.
 *
 * @example
 * ```typescript
 * // instrumentation.ts
 * export async function register() {
 *   const { init } = await import('@logdot-io/sdk/nextjs');
 *   init({ apiKey: 'ilog_live_xxx', hostname: 'my-app' });
 * }
 * ```
 */
export function init(config: NextjsInitConfig): void {
  if (sdkInstance) {
    log(config, 'LogDot auto-instrumentation already initialized');
    return;
  }

  // Enable HTTP metrics from the OTel HTTP instrumentation. Without this,
  // the instrumentation only generates spans (traces), not metrics.
  const currentOptIn = process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
  if (!currentOptIn) {
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http';
  } else if (!currentOptIn.includes('http')) {
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN = `${currentOptIn},http`;
  }

  const spanExporter = new LogDotSpanExporter({
    apiKey: config.apiKey,
    hostname: config.hostname,
    debug: config.debug,
    timeout: config.timeout,
  });

  const metricExporter = new LogDotMetricExporter({
    apiKey: config.apiKey,
    entityName: config.entityName ?? config.hostname,
    debug: config.debug,
    timeout: config.timeout,
  });

  // Register the MeterProvider globally BEFORE NodeSDK.start(). The NodeSDK
  // registers instrumentations before creating its MeterProvider, so the HTTP
  // instrumentation's metric histograms are created against a NoopMeter. The
  // SDK's post-hoc setMeterProvider() workaround reassigns the meter but the
  // instruments can remain disconnected from the collection pipeline. Setting
  // the global MeterProvider first ensures instruments are real from the start.
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000,
  });
  const meterProvider = new MeterProvider({ readers: [metricReader] });
  metrics.setGlobalMeterProvider(meterProvider);
  meterProviderInstance = meterProvider;

  const sdk = new NodeSDK({
    traceExporter: spanExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy/problematic instrumentations
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Disable logger instrumentations to avoid infinite loops
        // if the user also uses LogDotLogger directly
        '@opentelemetry/instrumentation-winston': { enabled: false },
        '@opentelemetry/instrumentation-bunyan': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
      }),
    ],
  });

  sdk.start();
  sdkInstance = sdk;

  // The OTel HTTP instrumentation hooks into `require('http')` via
  // require-in-the-middle. If http/https were already loaded before init()
  // was called (common in tests and frameworks), the hook never fired and
  // the modules stay unpatched — no spans, no metrics. Re-requiring them
  // triggers the hook, which patches the module objects in place (built-in
  // modules are singletons so existing references see the patched version).
  try { require('http'); require('https'); } catch { /* ignore */ }

  if (config.captureConsole) {
    consoleCaptureInstance = new ConsoleCapture({
      apiKey: config.apiKey,
      hostname: config.hostname,
      timeout: config.timeout,
    });
  }

  log(config, 'LogDot auto-instrumentation initialized');

  // Graceful shutdown
  const gracefulShutdown = () => {
    consoleCaptureInstance?.shutdown();
    sdk.shutdown()
      .then(() => meterProvider.shutdown())
      .catch(() => {});
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

/**
 * Gracefully shut down the auto-instrumentation.
 *
 * Flushes all pending spans and metrics, then stops the OTel SDK
 * and console capture. Call this before process exit to ensure
 * all data is sent.
 */
export async function shutdown(): Promise<void> {
  consoleCaptureInstance?.shutdown();
  consoleCaptureInstance = null;

  if (sdkInstance) {
    await sdkInstance.shutdown();
    sdkInstance = null;
  }

  // Shut down the MeterProvider after the SDK so that any final metrics
  // recorded during SDK shutdown (span processing etc.) are flushed.
  if (meterProviderInstance) {
    await meterProviderInstance.shutdown();
    meterProviderInstance = null;
  }
}

function log(config: NextjsInitConfig, message: string): void {
  if (config.debug) {
    console.log(`[LogDot] ${message}`);
  }
}
