/**
 * LogDot SDK Test Application
 *
 * This script tests all SDK functionality against the live LogDot API.
 *
 * Setup: Create a .env file in the project root with:
 *   LOGDOT_API_KEY=ilog_live_YOUR_API_KEY
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LogDotLogger, LogDotMetrics } from '../src/index';

// Load .env file from project root
function loadEnv(): void {
  try {
    const envPath = resolve(__dirname, '../../.env');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  } catch (error) {
    console.error('Failed to load .env file. Create one with LOGDOT_API_KEY=your_key');
    process.exit(1);
  }
}

loadEnv();

const API_KEY = process.env.LOGDOT_API_KEY;
if (!API_KEY) {
  console.error('LOGDOT_API_KEY not found in .env file');
  process.exit(1);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('LogDot Node.js SDK Test Application');
  console.log('='.repeat(60));
  console.log();

  // Create separate logger and metrics clients
  const logger = new LogDotLogger({
    apiKey: API_KEY,
    hostname: 'nodejs-test-app',
    debug: true,
  });

  const metrics = new LogDotMetrics({
    apiKey: API_KEY,
    debug: true,
  });

  let passed = 0;
  let failed = 0;

  // ==================== Test 1: Single Logs ====================
  console.log('\n--- Test 1: Single Logs (all levels) ---\n');

  // Debug
  let result = await logger.debug('Test debug message from Node.js SDK');
  if (result) {
    console.log('  [PASS] debug log sent successfully');
    passed++;
  } else {
    console.log('  [FAIL] debug log failed');
    failed++;
  }
  await sleep(500);

  // Info
  result = await logger.info('Test info message from Node.js SDK');
  if (result) {
    console.log('  [PASS] info log sent successfully');
    passed++;
  } else {
    console.log('  [FAIL] info log failed');
    failed++;
  }
  await sleep(500);

  // Warn
  result = await logger.warn('Test warn message from Node.js SDK');
  if (result) {
    console.log('  [PASS] warn log sent successfully');
    passed++;
  } else {
    console.log('  [FAIL] warn log failed');
    failed++;
  }
  await sleep(500);

  // Error
  result = await logger.error('Test error message from Node.js SDK');
  if (result) {
    console.log('  [PASS] error log sent successfully');
    passed++;
  } else {
    console.log('  [FAIL] error log failed');
    failed++;
  }
  await sleep(500);

  // ==================== Test 2: Logs with Tags ====================
  console.log('\n--- Test 2: Logs with Tags ---\n');

  const tagResult = await logger.info('Log with structured tags', {
    sdk: 'nodejs',
    version: '1.0.0',
    test: true,
    timestamp: new Date().toISOString(),
  });

  if (tagResult) {
    console.log('  [PASS] Log with tags sent successfully');
    passed++;
  } else {
    console.log('  [FAIL] Log with tags failed');
    failed++;
  }
  await sleep(500);

  // ==================== Test 3: Context-aware Logging ====================
  console.log('\n--- Test 3: Context-aware Logging ---\n');

  const userLogger = logger.withContext({ user_id: 123, session: 'abc-123' });
  const contextResult = await userLogger.info('User performed action', { action: 'login' });

  if (contextResult) {
    console.log('  [PASS] Context-aware log sent successfully');
    console.log(`  Context: ${JSON.stringify(userLogger.getContext())}`);
    passed++;
  } else {
    console.log('  [FAIL] Context-aware log failed');
    failed++;
  }
  await sleep(500);

  // ==================== Test 4: Chained Context ====================
  console.log('\n--- Test 4: Chained Context ---\n');

  // Chain contexts - add more context to existing context
  const requestLogger = userLogger.withContext({ request_id: 'req-456', endpoint: '/api/users' });
  const chainedResult = await requestLogger.info('Processing request');

  if (chainedResult) {
    console.log('  [PASS] Chained context log sent successfully');
    console.log(`  Original context: ${JSON.stringify(userLogger.getContext())}`);
    console.log(`  Chained context: ${JSON.stringify(requestLogger.getContext())}`);
    passed++;
  } else {
    console.log('  [FAIL] Chained context log failed');
    failed++;
  }

  // Test context value overwriting
  const overwriteLogger = userLogger.withContext({ user_id: 456 }); // Overwrite user_id
  console.log(`  Overwrite test - new user_id: ${overwriteLogger.getContext().user_id}`);
  await sleep(500);

  // ==================== Test 5: Batch Logs ====================
  console.log('\n--- Test 5: Batch Logs (all levels) ---\n');

  logger.beginBatch();
  console.log('  Started batch mode');

  // Test all severity levels in batch
  await logger.debug('Batch debug message', { level: 'debug' });
  await logger.info('Batch info message', { level: 'info' });
  await logger.warn('Batch warn message', { level: 'warn' });
  await logger.error('Batch error message', { level: 'error' });
  console.log(`  Added 4 messages (all levels) to batch (size: ${logger.getBatchSize()})`);

  const batchResult = await logger.sendBatch();
  if (batchResult) {
    console.log('  [PASS] Batch logs sent successfully');
    passed++;
  } else {
    console.log('  [FAIL] Batch logs failed');
    failed++;
  }

  logger.endBatch();
  console.log('  Ended batch mode');
  await sleep(500);

  // ==================== Test 6: Clear Batch ====================
  console.log('\n--- Test 6: Clear Batch ---\n');

  logger.beginBatch();
  await logger.info('This message will be cleared');
  await logger.info('This one too');
  console.log(`  Batch size before clear: ${logger.getBatchSize()}`);

  logger.clearBatch();
  console.log(`  Batch size after clear: ${logger.getBatchSize()}`);

  if (logger.getBatchSize() === 0) {
    console.log('  [PASS] clearBatch works correctly');
    passed++;
  } else {
    console.log('  [FAIL] clearBatch did not clear the batch');
    failed++;
  }

  logger.endBatch();
  await sleep(500);

  // ==================== Test 7: Create/Get Metrics Entity ====================
  console.log('\n--- Test 7: Create/Get Metrics Entity ---\n');

  const entity = await metrics.getOrCreateEntity({
    name: 'nodejs-test-entity',
    description: 'Node.js SDK Test Entity',
    metadata: {
      sdk: 'nodejs',
      environment: 'test',
      created_at: new Date().toISOString(),
    },
  });

  if (entity) {
    console.log(`  [PASS] Entity created/found (ID: ${entity.id})`);
    passed++;
  } else {
    console.log(`  [FAIL] Entity creation failed: ${metrics.getLastError()}`);
    failed++;
    // Cannot continue without entity
    printSummary(passed, failed);
    return;
  }
  await sleep(500);

  // ==================== Test 8: Single Metrics (using forEntity) ====================
  console.log('\n--- Test 8: Single Metrics ---\n');

  const metricsClient = metrics.forEntity(entity.id);

  const metricResult = await metricsClient.send('cpu_usage', 45.5, 'percent', {
    host: 'nodejs-test',
    core: 0,
  });

  if (metricResult) {
    console.log('  [PASS] Single metric sent successfully');
    passed++;
  } else {
    console.log(`  [FAIL] Single metric failed: ${metricsClient.getLastError()}`);
    failed++;
  }
  await sleep(500);

  // ==================== Test 9: Batch Metrics (Same Metric) ====================
  console.log('\n--- Test 9: Batch Metrics (Same Metric) ---\n');

  metricsClient.beginBatch('temperature', 'celsius');
  console.log('  Started batch mode for "temperature"');

  const temperatures = [23.5, 24.1, 23.8, 24.5, 25.0];
  for (const temp of temperatures) {
    metricsClient.add(temp, { location: 'server_room' });
  }
  console.log(`  Added ${temperatures.length} values (size: ${metricsClient.getBatchSize()})`);

  const metricBatchResult = await metricsClient.sendBatch();
  if (metricBatchResult) {
    console.log('  [PASS] Metric batch sent successfully');
    passed++;
  } else {
    console.log(`  [FAIL] Metric batch failed: ${metricsClient.getLastError()}`);
    failed++;
  }

  metricsClient.endBatch();
  console.log('  Ended batch mode');
  await sleep(500);

  // ==================== Test 10: Multi-Metric Batch ====================
  console.log('\n--- Test 10: Multi-Metric Batch ---\n');

  metricsClient.beginMultiBatch();
  console.log('  Started multi-metric batch mode');

  metricsClient.addMetric('memory_used', 2048, 'MB', { type: 'heap' });
  metricsClient.addMetric('disk_free', 50.5, 'GB', { mount: '/' });
  metricsClient.addMetric('network_latency', 12.3, 'ms', { interface: 'eth0' });
  console.log(`  Added 3 different metrics (size: ${metricsClient.getBatchSize()})`);

  const multiBatchResult = await metricsClient.sendBatch();
  if (multiBatchResult) {
    console.log('  [PASS] Multi-metric batch sent successfully');
    passed++;
  } else {
    console.log(`  [FAIL] Multi-metric batch failed: ${metricsClient.getLastError()}`);
    failed++;
  }

  metricsClient.endBatch();
  console.log('  Ended batch mode');

  // ==================== Summary ====================
  printSummary(passed, failed);
}

function printSummary(passed: number, failed: number): void {
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nSome tests failed. Check the output above for details.');
    process.exit(1);
  } else {
    console.log('\nAll tests passed! The Node.js SDK is working correctly.');
    process.exit(0);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
