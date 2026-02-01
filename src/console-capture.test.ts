import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleCapture } from './console-capture';

// Mock the HTTP client
vi.mock('./http', () => ({
  BASE_LOGS_URL: 'https://logs.logdot.io/api/v1',
  HttpClient: vi.fn().mockImplementation(() => ({
    post: vi.fn().mockResolvedValue({ status: 200, data: {} }),
  })),
}));

describe('ConsoleCapture', () => {
  let capture: ConsoleCapture;
  let originalLog: typeof console.log;
  let originalInfo: typeof console.info;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;
  let originalDebug: typeof console.debug;

  beforeEach(() => {
    // Save originals before ConsoleCapture patches them
    originalLog = console.log;
    originalInfo = console.info;
    originalWarn = console.warn;
    originalError = console.error;
    originalDebug = console.debug;

    capture = new ConsoleCapture({
      apiKey: 'test_key',
      hostname: 'test-service',
      flushIntervalMs: 60000, // Long interval so we control flush timing
      maxBufferSize: 1000,    // High limit so auto-flush doesn't trigger
    });
  });

  afterEach(() => {
    capture.shutdown();
    // Ensure console is restored after each test
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
  });

  describe('constructor', () => {
    it('should patch console methods', () => {
      expect(console.log).not.toBe(originalLog);
      expect(console.info).not.toBe(originalInfo);
      expect(console.warn).not.toBe(originalWarn);
      expect(console.error).not.toBe(originalError);
      expect(console.debug).not.toBe(originalDebug);
    });
  });

  describe('shutdown', () => {
    it('should restore original console methods', () => {
      capture.shutdown();

      expect(console.log).toBe(originalLog);
      expect(console.info).toBe(originalInfo);
      expect(console.warn).toBe(originalWarn);
      expect(console.error).toBe(originalError);
      expect(console.debug).toBe(originalDebug);
    });

    it('should be idempotent', () => {
      capture.shutdown();
      capture.shutdown();

      expect(console.log).toBe(originalLog);
    });
  });

  describe('patched console methods', () => {
    it('should still call the original console.log', () => {
      const spy = vi.fn();
      // Replace the saved original with our spy
      (capture as any).originals.log = spy;
      // Re-patch with the spy as the "original"
      (capture as any).patch();

      console.log('test message');

      expect(spy).toHaveBeenCalledWith('test message');
    });

    it('should buffer log entries from console.log', () => {
      console.log('buffered message');

      const buffer = (capture as any).buffer;
      expect(buffer.length).toBe(1);
      expect(buffer[0].message).toBe('buffered message');
      expect(buffer[0].severity).toBe('info');
      expect(buffer[0].tags).toEqual({ source: 'console' });
    });

    it('should buffer console.warn as warn severity', () => {
      console.warn('warning message');

      const buffer = (capture as any).buffer;
      expect(buffer.length).toBe(1);
      expect(buffer[0].severity).toBe('warn');
    });

    it('should buffer console.error as error severity', () => {
      console.error('error message');

      const buffer = (capture as any).buffer;
      expect(buffer.length).toBe(1);
      expect(buffer[0].severity).toBe('error');
    });

    it('should buffer console.debug as debug severity', () => {
      console.debug('debug message');

      const buffer = (capture as any).buffer;
      expect(buffer.length).toBe(1);
      expect(buffer[0].severity).toBe('debug');
    });

    it('should buffer console.info as info severity', () => {
      console.info('info message');

      const buffer = (capture as any).buffer;
      expect(buffer.length).toBe(1);
      expect(buffer[0].severity).toBe('info');
    });

    it('should handle multiple arguments', () => {
      console.log('hello', 'world', 42);

      const buffer = (capture as any).buffer;
      expect(buffer[0].message).toBe('hello world 42');
    });

    it('should handle object arguments by JSON-stringifying', () => {
      console.log('data:', { key: 'value' });

      const buffer = (capture as any).buffer;
      expect(buffer[0].message).toBe('data: {"key":"value"}');
    });

    it('should handle Error objects', () => {
      const err = new Error('test error');
      console.error(err);

      const buffer = (capture as any).buffer;
      expect(buffer[0].message).toContain('Error: test error');
    });

    it('should queue multiple entries', () => {
      console.log('msg 1');
      console.log('msg 2');
      console.log('msg 3');

      expect((capture as any).buffer.length).toBe(3);
    });
  });

  describe('auto-flush on buffer size', () => {
    it('should flush when buffer reaches maxBufferSize', () => {
      const smallCapture = new ConsoleCapture({
        apiKey: 'test_key',
        hostname: 'test-service',
        flushIntervalMs: 60000,
        maxBufferSize: 3,
      });

      console.log('msg 1');
      console.log('msg 2');
      // Buffer has 2 entries (not yet at limit)
      expect((smallCapture as any).buffer.length).toBe(2);

      // Third entry triggers flush
      console.log('msg 3');
      // Buffer should be drained by flush
      expect((smallCapture as any).buffer.length).toBe(0);

      smallCapture.shutdown();
    });
  });

  describe('truncation', () => {
    it('should truncate very long messages', () => {
      const longMessage = 'x'.repeat(20000);
      console.log(longMessage);

      const buffer = (capture as any).buffer;
      expect(buffer[0].message.length).toBeLessThan(20000);
      expect(buffer[0].message).toContain('... [truncated]');
    });
  });
});
