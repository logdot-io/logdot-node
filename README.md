<p align="center">
  <h1 align="center">LogDot SDK for Node.js</h1>
  <p align="center">
    <strong>Cloud logging and metrics made simple</strong>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@logdot-io/sdk"><img src="https://img.shields.io/npm/v/@logdot-io/sdk?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@logdot-io/sdk"><img src="https://img.shields.io/npm/dm/@logdot-io/sdk?style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/logdot-io/logdot-node/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square" alt="Node.js 18+"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-ready-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
</p>

<p align="center">
  <a href="https://logdot.io">Website</a> •
  <a href="https://docs.logdot.io">Documentation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api-reference">API Reference</a>
</p>

---

## Features

- **Separate Clients** — Independent logger and metrics clients for maximum flexibility
- **Context-Aware Logging** — Create loggers with persistent context that automatically flows through your application
- **Type-Safe** — Full TypeScript support with comprehensive type definitions
- **Entity-Based Metrics** — Create/find entities, then bind to them for organized metric collection
- **Batch Operations** — Efficiently send multiple logs or metrics in a single request
- **Automatic Retry** — Exponential backoff retry with configurable attempts
- **Zero Dependencies** — Uses native Node.js fetch (Node 18+)

## Installation

```bash
npm install @logdot-io/sdk
```

## Quick Start

```typescript
import { LogDotLogger, LogDotMetrics } from '@logdot-io/sdk';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOGGING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const logger = new LogDotLogger({
  apiKey: 'ilog_live_YOUR_API_KEY',
  hostname: 'my-service',
});

await logger.info('Application started');
await logger.error('Something went wrong', { error_code: 500 });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// METRICS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const metrics = new LogDotMetrics({
  apiKey: 'ilog_live_YOUR_API_KEY',
});

// Create or find an entity first
const entity = await metrics.getOrCreateEntity({
  name: 'my-service',
  description: 'My production service',
});

// Bind to the entity for sending metrics
const metricsClient = metrics.forEntity(entity.id);
await metricsClient.send('response_time', 123.45, 'ms');
```

## Logging

### Configuration

```typescript
const logger = new LogDotLogger({
  apiKey: 'ilog_live_YOUR_API_KEY',  // Required
  hostname: 'my-service',             // Required

  // Optional settings
  timeout: 5000,            // HTTP timeout (ms)
  retryAttempts: 3,         // Max retry attempts
  retryDelayMs: 1000,       // Base retry delay (ms)
  retryMaxDelayMs: 30000,   // Max retry delay (ms)
  debug: false,             // Enable debug output
});
```

### Log Levels

```typescript
await logger.debug('Debug message');
await logger.info('Info message');
await logger.warn('Warning message');
await logger.error('Error message');
```

### Structured Tags

```typescript
await logger.info('User logged in', {
  user_id: 12345,
  ip_address: '192.168.1.1',
  browser: 'Chrome',
});
```

### Context-Aware Logging

Create loggers with persistent context that automatically flows through your application:

```typescript
// Create a logger with context for a specific request
const requestLogger = logger.withContext({
  request_id: 'abc-123',
  user_id: 456,
});

// All logs include request_id and user_id automatically
await requestLogger.info('Processing request');
await requestLogger.debug('Fetching user data');

// Chain contexts — they merge together
const detailedLogger = requestLogger.withContext({
  operation: 'checkout',
});

// This log has request_id, user_id, AND operation
await detailedLogger.info('Starting checkout process');
```

### Batch Logging

Send multiple logs in a single HTTP request:

```typescript
logger.beginBatch();

await logger.info('Step 1 complete');
await logger.info('Step 2 complete');
await logger.info('Step 3 complete');

await logger.sendBatch();  // Single HTTP request
logger.endBatch();
```

## Metrics

### Entity Management

```typescript
const metrics = new LogDotMetrics({ apiKey: '...' });

// Create a new entity
const entity = await metrics.createEntity({
  name: 'my-service',
  description: 'Production API server',
  metadata: { environment: 'production', region: 'us-east-1' },
});

// Find existing entity
const existing = await metrics.getEntityByName('my-service');

// Get or create (recommended)
const entity = await metrics.getOrCreateEntity({
  name: 'my-service',
  description: 'Created if not exists',
});
```

### Sending Metrics

```typescript
const metricsClient = metrics.forEntity(entity.id);

// Single metric
await metricsClient.send('cpu_usage', 45.2, 'percent');
await metricsClient.send('response_time', 123.45, 'ms', {
  endpoint: '/api/users',
  method: 'GET',
});
```

### Batch Metrics

```typescript
// Same metric, multiple values
metricsClient.beginBatch('temperature', 'celsius');
metricsClient.add(23.5);
metricsClient.add(24.1);
metricsClient.add(23.8);
await metricsClient.sendBatch();
metricsClient.endBatch();

// Multiple different metrics
metricsClient.beginMultiBatch();
metricsClient.addMetric('cpu_usage', 45.2, 'percent');
metricsClient.addMetric('memory_used', 2048, 'MB');
metricsClient.addMetric('disk_free', 50.5, 'GB');
await metricsClient.sendBatch();
metricsClient.endBatch();
```

## Auto-Instrumentation (Next.js)

Automatically capture HTTP requests, database queries, and errors in Next.js apps with zero manual logging code.

### Prerequisites

Install the OpenTelemetry packages alongside the SDK:

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

### Setup

Create `instrumentation.ts` in your Next.js project root:

```typescript
export async function register() {
  const { init } = await import('@logdot-io/sdk/nextjs');
  init({
    apiKey: 'ilog_live_YOUR_API_KEY',
    hostname: 'my-nextjs-app',
  });
}
```

### What Gets Captured

- **HTTP requests** — Incoming requests with method, path, status code, and duration
- **Fetch calls** — Outgoing HTTP requests to external services
- **Database queries** — PostgreSQL, MySQL, Redis operations with timing
- **Errors** — Exceptions with stack traces and request context
- **Metrics** — Request duration and counts (entity is automatically created/resolved using `entityName`)

### Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | Yes | Your LogDot API key |
| `hostname` | string | Yes | Identifies this service in logs |
| `entityName` | string | No | Metrics entity name — automatically created if it doesn't exist (defaults to hostname) |
| `debug` | boolean | No | Enable debug logging (default: `false`) |
| `timeout` | number | No | HTTP timeout in ms (default: `5000`) |
| `captureConsole` | boolean | No | Forward `console.log/warn/error/debug` to LogDot (default: `false`) |

## Log Capture

Automatically forward all `console.log`, `console.info`, `console.warn`, `console.error`, and `console.debug` calls to LogDot. The original console output is preserved — messages still appear in your terminal as usual.

This works in **any Node.js application** (Express, Fastify, Hono, scripts, workers, etc.), not just Next.js.

### Standalone Usage

```typescript
import { ConsoleCapture } from '@logdot-io/sdk';

const capture = new ConsoleCapture({
  apiKey: 'ilog_live_YOUR_API_KEY',
  hostname: 'my-service',
});

// All console calls are now captured and sent to LogDot
console.log('This is sent to LogDot');          // severity: info
console.info('Info message');                    // severity: info
console.warn('Warning message');                 // severity: warn
console.error('Error message');                  // severity: error
console.debug('Debug message');                  // severity: debug

// When shutting down
capture.shutdown();
```

### With Next.js

When using the Next.js auto-instrumentation, pass `captureConsole: true`:

```typescript
// instrumentation.ts
export async function register() {
  const { init } = await import('@logdot-io/sdk/nextjs');
  init({
    apiKey: 'ilog_live_YOUR_API_KEY',
    hostname: 'my-nextjs-app',
    captureConsole: true,
  });
}
```

### How It Works

1. `ConsoleCapture` patches `console.log/info/warn/error/debug` with wrappers
2. Each call writes to the original console output **and** buffers the message
3. The buffer is flushed to LogDot every 5 seconds (configurable) or when it reaches 100 entries (configurable)
4. Messages are sent as a single batch HTTP request for efficiency
5. A **recursion guard** prevents infinite loops — when the HTTP client's own operations trigger console output during a flush, those calls are silently skipped
6. Messages longer than 16KB are truncated

### Configuration

```typescript
const capture = new ConsoleCapture({
  apiKey: 'ilog_live_YOUR_API_KEY',   // Required
  hostname: 'my-service',              // Required
  timeout: 5000,                       // HTTP timeout in ms (default: 5000)
  flushIntervalMs: 5000,               // How often to flush buffer (default: 5000)
  maxBufferSize: 100,                  // Auto-flush when buffer reaches this size (default: 100)
});
```

### Tags

All captured console logs include `{ source: "console" }` in their tags, so you can filter them from manually sent logs in the LogDot dashboard.

### Shutdown

Always call `capture.shutdown()` before your process exits. This restores the original console methods and sends any remaining buffered logs.

```typescript
process.on('SIGTERM', () => {
  capture.shutdown();
  process.exit(0);
});
```

### OTel Shutdown

When using the Next.js auto-instrumentation, call `shutdown()` before your process exits to flush all pending spans and metrics. OTel batches metric exports on a 60-second interval, so without an explicit shutdown, data may be lost.

```typescript
import { init, shutdown } from '@logdot-io/sdk/nextjs';

init({ apiKey: '...', hostname: 'my-app' });

// Before exit
await shutdown();
```

The `init()` function also registers `SIGTERM` and `SIGINT` handlers that call `shutdown()` automatically, so long-running servers (like Next.js) will flush on graceful termination.

## API Reference

### LogDotLogger

| Method | Description |
|--------|-------------|
| `withContext(context)` | Create new logger with merged context |
| `getContext()` | Get current context object |
| `debug/info/warn/error(message, tags?)` | Send log at level |
| `beginBatch()` | Start batch mode |
| `sendBatch()` | Send queued logs |
| `endBatch()` | End batch mode |
| `clearBatch()` | Clear queue without sending |
| `getBatchSize()` | Get queue size |

### LogDotMetrics

| Method | Description |
|--------|-------------|
| `createEntity(options)` | Create a new entity |
| `getEntityByName(name)` | Find entity by name |
| `getOrCreateEntity(options)` | Get existing or create new |
| `forEntity(entityId)` | Create bound metrics client |

### BoundMetricsClient

| Method | Description |
|--------|-------------|
| `send(name, value, unit, tags?)` | Send single metric |
| `beginBatch(name, unit)` | Start single-metric batch |
| `add(value, tags?)` | Add to batch |
| `beginMultiBatch()` | Start multi-metric batch |
| `addMetric(name, value, unit, tags?)` | Add metric to batch |
| `sendBatch()` | Send queued metrics |
| `endBatch()` | End batch mode |

### Auto-Instrumentation (nextjs)

| Function | Description |
|----------|-------------|
| `init(config)` | Start OTel auto-instrumentation |
| `shutdown()` | Flush pending spans/metrics and stop the OTel SDK |

### ConsoleCapture

| Method | Description |
|--------|-------------|
| `new ConsoleCapture(config)` | Start capturing console output |
| `shutdown()` | Restore console methods and flush remaining buffer |

## Examples

Create a `.env` file in the repo root with your API key:

```
LOGDOT_API_KEY=ilog_live_YOUR_API_KEY
```

### Core SDK test app

Tests logging, metrics, context, and batch operations:

```bash
cd node
npx tsx examples/test-app.ts
```

### Hooks test app (OTel + Console Capture)

Tests Next.js auto-instrumentation (OTel spans/metrics) and console capture:

```bash
cd node
npx tsx examples/test-hooks.ts
```

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://logdot.io">logdot.io</a> •
  Built with care for developers
</p>
