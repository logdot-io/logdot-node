# LogDot SDK for Node.js

Official Node.js SDK for [LogDot](https://logdot.io) - Cloud logging and metrics made simple.

## Features

- **Separate Clients**: Independent logger and metrics clients for flexibility
- **Context-Aware Logging**: Create loggers with persistent context that's automatically added to all logs
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Flexible Logging**: 4 log levels (debug, info, warn, error) with structured tags
- **Entity-Based Metrics**: Create/find entities, then bind to them for sending metrics
- **Batch Operations**: Efficiently send multiple logs or metrics in a single request
- **Automatic Retry**: Exponential backoff retry with configurable attempts
- **Zero Dependencies**: Uses native Node.js fetch (Node 18+)

## Installation

```bash
npm install logdot
```

## Quick Start

```typescript
import { LogDotLogger, LogDotMetrics } from 'logdot';

// === LOGGING ===
const logger = new LogDotLogger({
  apiKey: 'ilog_live_YOUR_API_KEY',
  hostname: 'my-service',
});

await logger.info('Application started');
await logger.error('Something went wrong', { error_code: 500 });

// === METRICS ===
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
import { LogDotLogger } from 'logdot';

const logger = new LogDotLogger({
  // Required
  apiKey: 'ilog_live_YOUR_API_KEY',
  hostname: 'my-service',

  // Optional - defaults shown
  timeout: 5000,                 // HTTP timeout (ms)
  retryAttempts: 3,              // Max retry attempts
  retryDelayMs: 1000,            // Base retry delay (ms)
  retryMaxDelayMs: 30000,        // Max retry delay (ms)
  debug: false,                  // Enable debug output
});
```

### Basic Logging

```typescript
await logger.debug('Debug message');
await logger.info('Info message');
await logger.warn('Warning message');
await logger.error('Error message');
```

### Logging with Tags

```typescript
await logger.info('User logged in', {
  user_id: 12345,
  ip_address: '192.168.1.1',
  browser: 'Chrome',
});

await logger.error('Database connection failed', {
  host: 'db.example.com',
  port: 5432,
  error: 'Connection timeout',
});
```

### Context-Aware Logging

Create loggers with persistent context that's automatically added to all logs:

```typescript
const logger = new LogDotLogger({
  apiKey: 'ilog_live_YOUR_API_KEY',
  hostname: 'my-service',
});

// Create a logger with context for a specific request
const requestLogger = logger.withContext({
  request_id: 'abc-123',
  user_id: 456,
});

// All logs from requestLogger will include request_id and user_id
await requestLogger.info('Processing request');
await requestLogger.debug('Fetching user data');
await requestLogger.info('Request completed');

// You can chain contexts - they merge together
const detailedLogger = requestLogger.withContext({
  operation: 'checkout',
});

// This log will have request_id, user_id, AND operation
await detailedLogger.info('Starting checkout process');

// Original logger is unchanged
await logger.info('This log has no context');
```

### Context with Additional Tags

When you provide tags to a log call, they're merged with the context (tags take precedence):

```typescript
const logger = new LogDotLogger({
  apiKey: '...',
  hostname: 'api',
}).withContext({
  service: 'api',
  environment: 'production',
});

// The log will have: service, environment, endpoint, status
await logger.info('Request handled', {
  endpoint: '/users',
  status: 200,
});

// Override context values if needed
await logger.info('Custom service', {
  service: 'worker', // This overrides the context value
});
```

### Batch Logging

Send multiple logs in a single HTTP request for better efficiency:

```typescript
// Start batch mode
logger.beginBatch();

// Queue logs (no network calls yet)
await logger.info('Request received');
await logger.debug('Processing started');
await logger.info('Processing complete');

// Send all logs in one request
await logger.sendBatch();

// End batch mode
logger.endBatch();
```

## Metrics

### Configuration

```typescript
import { LogDotMetrics } from 'logdot';

const metrics = new LogDotMetrics({
  // Required
  apiKey: 'ilog_live_YOUR_API_KEY',

  // Optional - defaults shown
  timeout: 5000,                 // HTTP timeout (ms)
  retryAttempts: 3,              // Max retry attempts
  retryDelayMs: 1000,            // Base retry delay (ms)
  retryMaxDelayMs: 30000,        // Max retry delay (ms)
  debug: false,                  // Enable debug output
});
```

### Entity Management

Before sending metrics, you need to create or find an entity:

```typescript
// Create a new entity
const entity = await metrics.createEntity({
  name: 'my-service',
  description: 'My production service',
  metadata: {
    environment: 'production',
    region: 'us-east-1',
    version: '1.2.3',
  },
});

// Or find an existing entity by name
const existing = await metrics.getEntityByName('my-service');

// Or get or create (finds existing, creates if not found)
const entity = await metrics.getOrCreateEntity({
  name: 'my-service',
  description: 'Created if not exists',
});
```

### Binding to an Entity

Once you have an entity, bind to it for sending metrics:

```typescript
const entity = await metrics.getOrCreateEntity({ name: 'my-service' });
const metricsClient = metrics.forEntity(entity.id);

// Now send metrics
await metricsClient.send('cpu_usage', 45.2, 'percent');
await metricsClient.send('response_time', 123.45, 'ms', {
  endpoint: '/api/users',
  method: 'GET',
});
```

### Batch Metrics (Same Metric)

Send multiple values for the same metric:

```typescript
// Start batch for a specific metric
metricsClient.beginBatch('temperature', 'celsius');

// Add values
metricsClient.add(23.5);
metricsClient.add(24.1);
metricsClient.add(23.8);
metricsClient.add(24.5);

// Send all values in one request
await metricsClient.sendBatch();

// End batch mode
metricsClient.endBatch();
```

### Multi-Metric Batch

Send different metrics in a single request:

```typescript
// Start multi-metric batch
metricsClient.beginMultiBatch();

// Add different metrics
metricsClient.addMetric('cpu_usage', 45.2, 'percent');
metricsClient.addMetric('memory_used', 2048, 'MB');
metricsClient.addMetric('disk_free', 50.5, 'GB');

// Send all metrics in one request
await metricsClient.sendBatch();

// End batch mode
metricsClient.endBatch();
```

## Error Handling

```typescript
// Check if operations succeeded
const logSuccess = await logger.info('Test message');
if (!logSuccess) {
  console.error('Failed to send log');
}

// For metrics, check last error
const metricSuccess = await metricsClient.send('test', 1, 'unit');
if (!metricSuccess) {
  console.error('Failed to send metric:', metricsClient.getLastError());
  console.error('HTTP code:', metricsClient.getLastHttpCode());
}
```

## Debug Mode

Enable debug output to see HTTP requests and responses:

```typescript
const logger = new LogDotLogger({
  apiKey: '...',
  hostname: 'my-service',
  debug: true, // Enable at construction
});

// Or enable later
logger.setDebug(true);
```

## API Reference

### LogDotLogger

| Method | Description |
|--------|-------------|
| `withContext(context)` | Create new logger with merged context |
| `getContext()` | Get current context object |
| `debug(message, tags?)` | Send debug log |
| `info(message, tags?)` | Send info log |
| `warn(message, tags?)` | Send warning log |
| `error(message, tags?)` | Send error log |
| `log(level, message, tags?)` | Send log at specified level |
| `beginBatch()` | Start batch mode |
| `sendBatch()` | Send queued logs |
| `endBatch()` | End batch mode |
| `clearBatch()` | Clear queue without sending |
| `getBatchSize()` | Get queue size |
| `getHostname()` | Get hostname |
| `setDebug(enabled)` | Enable/disable debug |

### LogDotMetrics

| Method | Description |
|--------|-------------|
| `createEntity(options)` | Create a new entity |
| `getEntityByName(name)` | Find entity by name |
| `getOrCreateEntity(options)` | Get existing or create new entity |
| `forEntity(entityId)` | Create bound client for entity |
| `getLastError()` | Get last error message |
| `getLastHttpCode()` | Get last HTTP code |
| `setDebug(enabled)` | Enable/disable debug |

### BoundMetricsClient (from `forEntity`)

| Method | Description |
|--------|-------------|
| `getEntityId()` | Get bound entity ID |
| `send(name, value, unit, tags?)` | Send single metric |
| `beginBatch(name, unit)` | Start single-metric batch |
| `add(value, tags?)` | Add to single-metric batch |
| `beginMultiBatch()` | Start multi-metric batch |
| `addMetric(name, value, unit, tags?)` | Add to multi-metric batch |
| `sendBatch()` | Send queued metrics |
| `endBatch()` | End batch mode |
| `clearBatch()` | Clear queue |
| `getBatchSize()` | Get queue size |
| `getLastError()` | Get last error message |
| `getLastHttpCode()` | Get last HTTP code |
| `setDebug(enabled)` | Enable/disable debug |

## Requirements

- Node.js 18.0.0 or higher

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [LogDot Website](https://logdot.io)
- [Documentation](https://docs.logdot.io)
- [GitHub Repository](https://github.com/logdot-io/logdot-node)
