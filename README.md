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

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://logdot.io">logdot.io</a> •
  Built with care for developers
</p>
