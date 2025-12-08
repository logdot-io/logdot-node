import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogDotMetrics, BoundMetricsClient } from './metrics';

// Mock the HTTP client
vi.mock('./http', () => ({
  BASE_METRICS_URL: 'https://metrics.logdot.io/api/v1',
  HttpClient: vi.fn().mockImplementation(() => ({
    post: vi.fn().mockResolvedValue({
      status: 200,
      data: { data: { id: 'entity-uuid-123' } },
    }),
    get: vi.fn().mockResolvedValue({
      status: 200,
      data: { data: { id: 'entity-uuid-123', name: 'test-entity' } },
    }),
  })),
}));

describe('LogDotMetrics', () => {
  let metrics: LogDotMetrics;

  beforeEach(() => {
    vi.clearAllMocks();
    metrics = new LogDotMetrics({
      apiKey: 'test_api_key',
    });
  });

  describe('constructor', () => {
    it('should create metrics client with api key', () => {
      expect(metrics).toBeInstanceOf(LogDotMetrics);
    });
  });

  describe('createEntity', () => {
    it('should create an entity and return it', async () => {
      const entity = await metrics.createEntity({
        name: 'test-service',
        description: 'Test service description',
      });

      expect(entity).not.toBeNull();
      expect(entity?.name).toBe('test-service');
      expect(entity?.id).toBe('entity-uuid-123');
    });

    it('should accept metadata', async () => {
      const entity = await metrics.createEntity({
        name: 'test-service',
        description: 'Test',
        metadata: { version: '1.0.0', region: 'us-east-1' },
      });

      expect(entity).not.toBeNull();
    });
  });

  describe('getEntityByName', () => {
    it('should find an entity by name', async () => {
      const entity = await metrics.getEntityByName('test-service');

      expect(entity).not.toBeNull();
      expect(entity?.id).toBe('entity-uuid-123');
    });
  });

  describe('getOrCreateEntity', () => {
    it('should return existing entity if found', async () => {
      const entity = await metrics.getOrCreateEntity({
        name: 'test-service',
      });

      expect(entity).not.toBeNull();
      expect(entity?.id).toBe('entity-uuid-123');
    });
  });

  describe('forEntity', () => {
    it('should return a BoundMetricsClient', () => {
      const client = metrics.forEntity('entity-uuid-123');

      expect(client).toBeInstanceOf(BoundMetricsClient);
      expect(client.getEntityId()).toBe('entity-uuid-123');
    });
  });
});

describe('BoundMetricsClient', () => {
  let metrics: LogDotMetrics;
  let client: BoundMetricsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    metrics = new LogDotMetrics({ apiKey: 'test_api_key' });
    client = metrics.forEntity('entity-uuid-123');
  });

  describe('getEntityId', () => {
    it('should return the bound entity ID', () => {
      expect(client.getEntityId()).toBe('entity-uuid-123');
    });
  });

  describe('send', () => {
    it('should send a metric', async () => {
      const result = await client.send('cpu.usage', 45.5, 'percent');
      expect(result).toBe(true);
    });

    it('should send a metric with tags', async () => {
      const result = await client.send('response_time', 123, 'ms', {
        endpoint: '/api/users',
        method: 'GET',
      });
      expect(result).toBe(true);
    });

    it('should fail in batch mode', async () => {
      client.beginBatch('temperature', 'celsius');
      const result = await client.send('cpu', 50, 'percent');
      expect(result).toBe(false);
    });
  });

  describe('batch operations', () => {
    describe('single-metric batch', () => {
      it('should queue values in batch mode', () => {
        client.beginBatch('temperature', 'celsius');
        client.add(23.5);
        client.add(24.0);
        client.add(23.8);

        expect(client.getBatchSize()).toBe(3);
      });

      it('should clear batch on endBatch', () => {
        client.beginBatch('temperature', 'celsius');
        client.add(23.5);
        client.endBatch();

        expect(client.getBatchSize()).toBe(0);
      });

      it('should fail to add when not in batch mode', () => {
        const result = client.add(23.5);
        expect(result).toBe(false);
      });
    });

    describe('multi-metric batch', () => {
      it('should queue different metrics in multi-batch mode', () => {
        client.beginMultiBatch();
        client.addMetric('cpu', 45, 'percent');
        client.addMetric('memory', 2048, 'MB');
        client.addMetric('disk', 50, 'GB');

        expect(client.getBatchSize()).toBe(3);
      });

      it('should fail to addMetric when not in multi-batch mode', () => {
        const result = client.addMetric('cpu', 45, 'percent');
        expect(result).toBe(false);
      });

      it('should fail to add in multi-batch mode', () => {
        client.beginMultiBatch();
        const result = client.add(45);
        expect(result).toBe(false);
      });
    });

    describe('sendBatch', () => {
      it('should send batched metrics', async () => {
        client.beginBatch('temperature', 'celsius');
        client.add(23.5);
        client.add(24.0);

        const result = await client.sendBatch();
        expect(result).toBe(true);
        expect(client.getBatchSize()).toBe(0);
      });

      it('should return false for empty batch', async () => {
        client.beginBatch('temperature', 'celsius');
        const result = await client.sendBatch();
        expect(result).toBe(false);
      });
    });

    describe('clearBatch', () => {
      it('should clear without sending', () => {
        client.beginBatch('temperature', 'celsius');
        client.add(23.5);
        client.clearBatch();

        expect(client.getBatchSize()).toBe(0);
      });
    });
  });

  describe('error tracking', () => {
    it('should track last error', () => {
      client.add(23.5); // Should fail - not in batch mode
      expect(client.getLastError()).toContain('batch mode');
    });

    it('should start with empty error', () => {
      // After successful operation
      expect(client.getLastHttpCode()).toBe(-1);
    });
  });
});
