import { describe, it, expect } from 'vitest';
import { logger } from '../../src/lib/logger.js';

describe('Logger', () => {
  it('should create logger instance', () => {
    expect(logger).toBeDefined();
  });

  it('should have standard logging methods', () => {
    expect(logger.info).toBeInstanceOf(Function);
    expect(logger.error).toBeInstanceOf(Function);
    expect(logger.warn).toBeInstanceOf(Function);
    expect(logger.debug).toBeInstanceOf(Function);
  });
});
