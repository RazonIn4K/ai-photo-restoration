import { describe, it, expect, beforeEach } from 'vitest';

import {
  buildEthicalPrompt,
  calculateCost,
  CircuitBreaker,
  getDefaultGeminiConfig
} from '../../src/workers/cloud-ai-pipeline.js';

describe('Cloud AI Pipeline Worker', () => {
  describe('buildEthicalPrompt', () => {
    it('should build ethical prompt for color restoration', () => {
      const prompt = buildEthicalPrompt(
        'color_restoration',
        'Please colorize this black and white photo'
      );

      expect(prompt).toContain('PRESERVE ORIGINAL FEATURES');
      expect(prompt).toContain('NO STEREOTYPING');
      expect(prompt).toContain('COLORIZATION GUIDELINES');
      expect(prompt).toContain('Please colorize this black and white photo');
      expect(prompt).toContain('color_restoration');
    });

    it('should build ethical prompt for face restoration', () => {
      const prompt = buildEthicalPrompt('face_restoration', 'Restore the faces in this photo');

      expect(prompt).toContain('FACE RESTORATION GUIDELINES');
      expect(prompt).toContain('Preserve unique characteristics');
      expect(prompt).toContain('Do not "beautify"');
      expect(prompt).toContain('Respect cultural and ethnic facial characteristics');
    });

    it('should build ethical prompt for damage repair', () => {
      const prompt = buildEthicalPrompt('damage_repair', 'Fix the tears and scratches');

      expect(prompt).toContain('DAMAGE REPAIR GUIDELINES');
      expect(prompt).toContain('Repair tears, scratches');
      expect(prompt).toContain('Do not add elements that were not originally present');
    });

    it('should build ethical prompt for quality enhancement', () => {
      const prompt = buildEthicalPrompt('quality_enhancement', 'Enhance the quality');

      expect(prompt).toContain('QUALITY ENHANCEMENT GUIDELINES');
      expect(prompt).toContain('Enhance sharpness and clarity');
      expect(prompt).toContain('Avoid artificial smoothing');
    });

    it('should build ethical prompt for general restoration', () => {
      const prompt = buildEthicalPrompt('general_restoration', 'Restore this old photo');

      expect(prompt).toContain('GENERAL RESTORATION GUIDELINES');
      expect(prompt).toContain('Prioritize authenticity over perfection');
    });

    it('should include critical ethical requirements in all prompts', () => {
      const categories = [
        'color_restoration',
        'face_restoration',
        'damage_repair',
        'quality_enhancement',
        'general_restoration'
      ];

      for (const category of categories) {
        const prompt = buildEthicalPrompt(category, 'Test request');

        expect(prompt).toContain('PRESERVE ORIGINAL FEATURES');
        expect(prompt).toContain('NO STEREOTYPING');
        expect(prompt).toContain('AUTHENTIC RESTORATION');
        expect(prompt).toContain('RESPECT DIGNITY');
        expect(prompt).toContain('TRANSPARENCY');
      }
    });

    it('should include user request in prompt', () => {
      const userRequest = 'Please restore this family photo from the 1950s';
      const prompt = buildEthicalPrompt('general_restoration', userRequest);

      expect(prompt).toContain(userRequest);
    });

    it('should handle unknown intent categories', () => {
      const prompt = buildEthicalPrompt('unknown', 'Help with this photo');

      expect(prompt).toContain('GENERAL RESTORATION GUIDELINES');
      expect(prompt).toContain('PRESERVE ORIGINAL FEATURES');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for typical usage', () => {
      const usage = {
        promptTokens: 1000,
        candidateTokens: 2000,
        totalTokens: 3000
      };

      const cost = calculateCost(usage);

      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe('number');
    });

    it('should calculate higher cost for more tokens', () => {
      const smallUsage = {
        promptTokens: 100,
        candidateTokens: 200,
        totalTokens: 300
      };

      const largeUsage = {
        promptTokens: 10000,
        candidateTokens: 20000,
        totalTokens: 30000
      };

      const smallCost = calculateCost(smallUsage);
      const largeCost = calculateCost(largeUsage);

      expect(largeCost).toBeGreaterThan(smallCost);
    });

    it('should handle zero tokens', () => {
      const usage = {
        promptTokens: 0,
        candidateTokens: 0,
        totalTokens: 0
      };

      const cost = calculateCost(usage);

      expect(cost).toBe(0);
    });

    it('should weight candidate tokens more than prompt tokens', () => {
      const promptHeavy = {
        promptTokens: 10000,
        candidateTokens: 1000,
        totalTokens: 11000
      };

      const candidateHeavy = {
        promptTokens: 1000,
        candidateTokens: 10000,
        totalTokens: 11000
      };

      const promptCost = calculateCost(promptHeavy);
      const candidateCost = calculateCost(candidateHeavy);

      // Candidate tokens should cost more
      expect(candidateCost).toBeGreaterThan(promptCost);
    });
  });

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(3, 1000); // 3 failures, 1 second reset
    });

    it('should start in closed state', () => {
      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should allow execution in closed state', () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should remain closed after successful executions', () => {
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should open after threshold failures', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe('open');
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should not open before reaching threshold', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should transition to half-open after reset time', async () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe('open');
      expect(circuitBreaker.canExecute()).toBe(false);

      // Wait for reset time
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should transition to half-open
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState()).toBe('half-open');
    });

    it('should close from half-open on successful execution', async () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Transition to half-open
      circuitBreaker.canExecute();

      // Record success
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should reopen from half-open on failed execution', async () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Transition to half-open
      circuitBreaker.canExecute();

      // Record failure
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe('open');
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should reset failure count on success', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();

      // Should not open even after 2 more failures (total 4, but reset after success)
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should allow manual reset', () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe('open');

      // Manual reset
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should handle custom threshold', () => {
      const customBreaker = new CircuitBreaker(5, 1000);

      // Should not open after 4 failures
      customBreaker.recordFailure();
      customBreaker.recordFailure();
      customBreaker.recordFailure();
      customBreaker.recordFailure();

      expect(customBreaker.getState()).toBe('closed');

      // Should open after 5th failure
      customBreaker.recordFailure();

      expect(customBreaker.getState()).toBe('open');
    });
  });

  describe('getDefaultGeminiConfig', () => {
    it('should return default configuration', () => {
      const config = getDefaultGeminiConfig('test-api-key');

      expect(config.apiKey).toBe('test-api-key');
      expect(config.model).toBe('gemini-2.5-flash-image');
      expect(config.maxRetries).toBeGreaterThan(0);
      expect(config.timeoutMs).toBeGreaterThan(0);
      expect(config.circuitBreakerThreshold).toBeGreaterThan(0);
      expect(config.circuitBreakerResetMs).toBeGreaterThan(0);
    });

    it('should use reasonable default values', () => {
      const config = getDefaultGeminiConfig('test-key');

      expect(config.maxRetries).toBeLessThanOrEqual(5);
      expect(config.timeoutMs).toBeGreaterThanOrEqual(30000); // At least 30 seconds
      expect(config.circuitBreakerThreshold).toBeGreaterThanOrEqual(3);
      expect(config.circuitBreakerResetMs).toBeGreaterThanOrEqual(30000);
    });
  });
});
